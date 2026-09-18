import type { BillingOverview, StartSubscriptionRequest, Subscription } from '@cantina/contracts';
import type { Executor, Transaction } from '@cantina/db';
import {
  deliveryOrders,
  plans,
  preorders,
  products,
  subscriptionInvoices,
  subscriptions,
  tenants,
  users,
  withPlatform,
} from '@cantina/db';
import { eq, gte, isNull, sql } from 'drizzle-orm';

import { platformDb } from '../../db';
import { billingProvider } from '../../integrations/billing';
import { badRequest, conflict, notFound } from '../../http/errors/app-error';
import { logger } from '../../shared/logger';
import * as platformRepository from '../platform/platform.repository';
import { toPlan } from '../platform/platform.service';

/**
 * Assinatura vista pelo LOJISTA (§6.11 do PLAN.md, módulo 11).
 *
 * Este é o único serviço do sistema que atravessa as duas camadas: o uso do
 * plano está em tabelas de tenant, sob RLS; o plano, a assinatura e as
 * faturas estão em tabelas de plataforma, fora dela.
 *
 * A travessia é explícita e numa direção só — a transação de tenant conta o
 * uso, e só então uma segunda transação, de plataforma, lê a cobrança. O
 * caminho inverso não existe: nenhuma rota de plataforma abre contexto de
 * tenant, para que "ver a própria conta" nunca vire "ver a de todos".
 */

/* -------------------------------------------------------------------------- */
/* Uso — lido sob RLS, na transação do tenant                                  */
/* -------------------------------------------------------------------------- */

export interface Usage {
  products: number;
  users: number;
  ordersThisMonth: number;
}

export async function currentUsage(tx: Executor): Promise<Usage> {
  const firstOfMonth = new Date();
  firstOfMonth.setUTCDate(1);
  firstOfMonth.setUTCHours(0, 0, 0, 0);

  const [productCount, userCount, deliveryCount, preorderCount] = await Promise.all([
    tx
      .select({ total: sql<number>`count(*)` })
      .from(products)
      .where(isNull(products.deletedAt)),
    tx
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .where(isNull(users.deletedAt)),
    // Conta pelo que foi FEITO no mês, não pelo que foi concluído: o limite
    // do plano é de volume de uso, e um pedido cancelado também consumiu o
    // sistema.
    tx
      .select({ total: sql<number>`count(*)` })
      .from(deliveryOrders)
      .where(gte(deliveryOrders.placedAt, firstOfMonth)),
    tx
      .select({ total: sql<number>`count(*)` })
      .from(preorders)
      .where(gte(preorders.placedAt, firstOfMonth)),
  ]);

  return {
    products: Number(productCount[0]?.total ?? 0),
    users: Number(userCount[0]?.total ?? 0),
    ordersThisMonth:
      Number(deliveryCount[0]?.total ?? 0) + Number(preorderCount[0]?.total ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Visão geral                                                                 */
/* -------------------------------------------------------------------------- */

type SubscriptionRow = typeof subscriptions.$inferSelect;
type InvoiceRow = typeof subscriptionInvoices.$inferSelect;
type PlanRow = typeof plans.$inferSelect;

function toSubscription(row: SubscriptionRow, plan: PlanRow): Subscription {
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    plan: toPlan(plan),
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
  };
}

function toInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    amountCents: row.amountCents,
    status: row.status,
    dueDate: row.dueDate?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    paymentUrl: row.paymentUrl,
  };
}

export async function overview(tx: Transaction, tenantId: string): Promise<BillingOverview> {
  const usage = await currentUsage(tx);

  return withPlatform(platformDb.db, async (platformTx) => {
    const [tenant] = await platformTx
      .select({ status: tenants.status, trialEndsAt: tenants.trialEndsAt })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw notFound('Empresa não encontrada.');

    const subscription = await platformRepository.findSubscriptionByTenant(platformTx, tenantId);
    const plan = subscription
      ? await platformRepository.findPlanById(platformTx, subscription.planId)
      : null;

    const invoices = await platformRepository.listInvoicesByTenant(platformTx, tenantId);
    const availablePlans = await platformRepository.listPlans(platformTx, true);

    return {
      tenantStatus: tenant.status,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      subscription: subscription && plan ? toSubscription(subscription, plan) : null,
      invoices: invoices.map(toInvoice),
      usage,
      availablePlans: availablePlans.map(toPlan),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Contratação                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Assina um plano.
 *
 * A ordem importa e não é reversível: o cliente e a assinatura são criados no
 * GATEWAY primeiro, e só depois gravados aqui. Se o gateway falhar, nada foi
 * gravado e o lojista tenta de novo; se o banco falhar depois do gateway,
 * sobra uma assinatura órfã lá — reconciliável pelo `externalReference`, que
 * carrega o `tenant_id`. O inverso (gravar antes) produziria um cliente
 * marcado como pagante que nunca foi cobrado, que é o erro caro.
 */
export async function start(
  tx: Transaction,
  tenantId: string,
  input: StartSubscriptionRequest,
  actorUserId: string,
): Promise<Subscription> {
  // O e-mail do dono é dado de tenant: lido sob RLS, na transação da rota,
  // e não pela conexão de plataforma. A travessia entre as duas camadas
  // continua indo só num sentido.
  const [actor] = await tx
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);

  return withPlatform(platformDb.db, async (platformTx) => {
    const [tenant] = await platformTx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw notFound('Empresa não encontrada.');

    const plan = await platformRepository.findPlanByCode(platformTx, input.planCode);
    if (!plan || !plan.active) throw notFound('Plano não encontrado.');

    const existing = await platformRepository.findSubscriptionByTenant(platformTx, tenantId);
    if (existing && existing.status === 'active') {
      throw conflict('Já existe uma assinatura ativa. Cancele antes de trocar de plano.', {
        subscriptionId: existing.id,
      });
    }

    if (plan.priceCents <= 0) {
      throw badRequest('Este plano não pode ser assinado pelo painel.');
    }

    const customer = await billingProvider.createCustomer({
      tenantId,
      name: tenant.legalName ?? tenant.name,
      email: input.email ?? actor?.email ?? '',
      document: input.document,
    });

    // Primeiro vencimento em três dias: tempo de o Pix ou o boleto ser pago
    // sem que a loja seja suspensa por atraso no mesmo dia da contratação.
    const nextDueDate = new Date();
    nextDueDate.setUTCDate(nextDueDate.getUTCDate() + 3);

    const created = await billingProvider.createSubscription({
      providerCustomerId: customer.providerCustomerId,
      planCode: plan.code,
      amountCents: plan.priceCents,
      billingType: input.billingType,
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
    });

    const row = existing
      ? await platformRepository.updateSubscription(platformTx, existing.id, {
          planId: plan.id,
          provider: billingProvider.name,
          providerCustomerId: customer.providerCustomerId,
          providerSubscriptionId: created.providerSubscriptionId,
          status: created.status === 'active' ? 'active' : 'past_due',
          currentPeriodStart: new Date(),
          currentPeriodEnd: created.currentPeriodEnd,
          canceledAt: null,
        })
      : await platformRepository.insertSubscription(platformTx, {
          tenantId,
          planId: plan.id,
          provider: billingProvider.name,
          providerCustomerId: customer.providerCustomerId,
          providerSubscriptionId: created.providerSubscriptionId,
          status: created.status === 'active' ? 'active' : 'past_due',
          currentPeriodStart: new Date(),
          currentPeriodEnd: created.currentPeriodEnd,
        });

    if (!row) throw notFound('Assinatura não encontrada.');

    // O documento informado na contratação passa a ser o da empresa: é o que
    // a nota fiscal e a conciliação com o gateway vão usar depois.
    await platformRepository.updateTenant(platformTx, tenantId, {
      planId: plan.id,
      document: input.document,
      status: created.status === 'active' ? 'active' : tenant.status,
    });

    logger.info(
      { tenantId, planCode: plan.code, provider: billingProvider.name },
      'Assinatura contratada',
    );

    return toSubscription(row, plan);
  });
}

export async function cancel(tenantId: string, reason: string): Promise<void> {
  await withPlatform(platformDb.db, async (platformTx) => {
    const subscription = await platformRepository.findSubscriptionByTenant(
      platformTx,
      tenantId,
    );

    if (!subscription || subscription.status === 'canceled') {
      throw notFound('Nenhuma assinatura ativa para cancelar.');
    }

    if (subscription.providerSubscriptionId) {
      await billingProvider.cancelSubscription(subscription.providerSubscriptionId);
    }

    await platformRepository.updateSubscription(platformTx, subscription.id, {
      status: 'canceled',
      canceledAt: new Date(),
    });

    // A empresa NÃO é suspensa aqui. O período já pago vale até o fim — é o
    // job de cobrança que muda o status quando o vencimento passar.
    logger.info({ tenantId, reason }, 'Assinatura cancelada pelo lojista');
  });
}

/* -------------------------------------------------------------------------- */
/* Limites de plano                                                            */
/* -------------------------------------------------------------------------- */

export type LimitKind = 'products' | 'users' | 'ordersThisMonth';

const LIMIT_FIELD: Record<LimitKind, 'maxProducts' | 'maxUsers' | 'maxOrdersPerMonth'> = {
  products: 'maxProducts',
  users: 'maxUsers',
  ordersThisMonth: 'maxOrdersPerMonth',
};

/**
 * O limite do plano da empresa, ou `null` quando não há limite.
 *
 * Ausente significa SEM limite, nunca zero. Tratar `undefined` como 0
 * trancaria o cliente para fora da própria conta na primeira consulta.
 */
export async function planLimit(tenantId: string, kind: LimitKind): Promise<number | null> {
  return withPlatform(platformDb.db, async (platformTx) => {
    const [row] = await platformTx
      .select({ limits: plans.limits })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, tenantId))
      .limit(1);

    // Empresa sem plano (o caso do teste) também não tem limite: o teste é
    // curto por natureza, e travá-lo por contagem só atrapalharia a avaliação.
    const value = row?.limits?.[LIMIT_FIELD[kind]];
    return typeof value === 'number' ? value : null;
  });
}
