import {
  plans,
  platformUsers,
  subscriptionInvoices,
  subscriptions,
  tenants,
  users,
  webhookEvents,
  type Executor,
} from '@cantina/db';
import { and, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

/**
 * Consultas da plataforma (§6.11 do PLAN.md, D5).
 *
 * TODAS rodam na conexão `cantina_platform`, com BYPASSRLS — este é o único
 * arquivo do sistema que enxerga mais de uma empresa por consulta. Nenhuma
 * função aqui pode ser chamada de uma rota de painel; a separação é garantida
 * por `platformRoute`, que abre a outra conexão.
 */

/* -------------------------------------------------------------------------- */
/* Usuários da plataforma                                                      */
/* -------------------------------------------------------------------------- */

export async function findPlatformUserByEmail(tx: Executor, email: string) {
  const rows = await tx
    .select()
    .from(platformUsers)
    .where(and(eq(platformUsers.email, email), isNull(platformUsers.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

export async function touchPlatformLogin(tx: Executor, id: string): Promise<void> {
  await tx.update(platformUsers).set({ lastLoginAt: new Date() }).where(eq(platformUsers.id, id));
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

export async function listPlans(tx: Executor, onlyActive = false) {
  return tx
    .select()
    .from(plans)
    .where(onlyActive ? eq(plans.active, true) : undefined)
    .orderBy(plans.priceCents);
}

export async function findPlanByCode(tx: Executor, code: string) {
  const rows = await tx.select().from(plans).where(eq(plans.code, code)).limit(1);
  return rows[0] ?? null;
}

export async function findPlanById(tx: Executor, id: string) {
  const rows = await tx.select().from(plans).where(eq(plans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertPlan(tx: Executor, values: typeof plans.$inferInsert) {
  const rows = await tx.insert(plans).values(values).returning();
  return rows[0]!;
}

export async function updatePlan(
  tx: Executor,
  id: string,
  values: Partial<typeof plans.$inferInsert>,
) {
  const rows = await tx.update(plans).set(values).where(eq(plans.id, id)).returning();
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Empresas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Faturas vencidas por empresa, em uma subconsulta.
 *
 * Poderia ser um join com `group by`, mas então toda coluna de `tenants`
 * teria de entrar no agrupamento — e a listagem passaria a mudar de forma
 * toda vez que alguém acrescentasse um campo ao cadastro.
 */
const overdueCount = sql<number>`(
  select count(*)
  from ${subscriptionInvoices} i
  where i.tenant_id = ${tenants.id}
    and i.status = 'overdue'
)`;

/**
 * Status e vencimento da assinatura MAIS RECENTE.
 *
 * Subconsulta correlacionada em vez de join: uma empresa que trocou de plano
 * tem duas linhas em `subscriptions`, e um join simples a faria aparecer duas
 * vezes na listagem — com o status antigo tão visível quanto o atual.
 */
const latestSubscription = (column: string) => sql`(
  select s.${sql.raw(column)}
  from ${subscriptions} s
  where s.tenant_id = ${tenants.id}
  order by s.created_at desc
  limit 1
)`;

const tenantColumns = {
  id: tenants.id,
  slug: tenants.slug,
  name: tenants.name,
  legalName: tenants.legalName,
  document: tenants.document,
  status: tenants.status,
  timeZone: tenants.timeZone,
  trialEndsAt: tenants.trialEndsAt,
  createdAt: tenants.createdAt,
  planId: plans.id,
  planCode: plans.code,
  planName: plans.name,
  planDescription: plans.description,
  planPriceCents: plans.priceCents,
  planLimits: plans.limits,
  planActive: plans.active,
  subscriptionStatus: sql<string | null>`${latestSubscription('status')}`,
  currentPeriodEnd: sql<Date | null>`${latestSubscription('current_period_end')}`,
  overdueInvoices: overdueCount,
};

export interface ListTenantsFilter {
  status?: string;
  q?: string;
  cursor?: string;
  limit: number;
}

export async function listTenants(tx: Executor, filter: ListTenantsFilter) {
  const conditions: SQL[] = [sql`${tenants.deletedAt} is null`];

  if (filter.status) conditions.push(sql`${tenants.status} = ${filter.status}`);
  if (filter.cursor) conditions.push(lt(tenants.id, filter.cursor));
  if (filter.q) {
    const term = `%${filter.q}%`;
    const match = or(ilike(tenants.name, term), ilike(tenants.slug, term));
    if (match) conditions.push(match);
  }

  return tx
    .select(tenantColumns)
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(and(...conditions))
    .orderBy(desc(tenants.id))
    .limit(filter.limit);
}

export async function findTenant(tx: Executor, id: string) {
  const rows = await tx
    .select(tenantColumns)
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(and(eq(tenants.id, id), sql`${tenants.deletedAt} is null`))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateTenant(
  tx: Executor,
  id: string,
  values: Partial<typeof tenants.$inferInsert>,
) {
  const rows = await tx.update(tenants).set(values).where(eq(tenants.id, id)).returning();
  return rows[0] ?? null;
}

export async function countUsers(tx: Executor, tenantId: string): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)));

  return Number(rows[0]?.total ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Assinaturas                                                                 */
/* -------------------------------------------------------------------------- */

export async function listSubscriptions(
  tx: Executor,
  filter: { status?: string; cursor?: string; limit: number },
) {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(sql`${subscriptions.status} = ${filter.status}`);
  if (filter.cursor) conditions.push(lt(subscriptions.id, filter.cursor));

  return tx
    .select({
      id: subscriptions.id,
      tenantId: subscriptions.tenantId,
      tenantName: tenants.name,
      planName: plans.name,
      priceCents: plans.priceCents,
      status: subscriptions.status,
      provider: subscriptions.provider,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      overdueInvoices: sql<number>`(
        select count(*) from ${subscriptionInvoices} i
        where i.subscription_id = ${subscriptions.id} and i.status = 'overdue'
      )`,
    })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(subscriptions.id))
    .limit(filter.limit);
}

export async function findSubscriptionByTenant(tx: Executor, tenantId: string) {
  const rows = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function findSubscriptionByProviderId(tx: Executor, providerId: string) {
  const rows = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, providerId))
    .limit(1);

  return rows[0] ?? null;
}

export async function insertSubscription(
  tx: Executor,
  values: typeof subscriptions.$inferInsert,
) {
  const rows = await tx.insert(subscriptions).values(values).returning();
  return rows[0]!;
}

export async function updateSubscription(
  tx: Executor,
  id: string,
  values: Partial<typeof subscriptions.$inferInsert>,
) {
  const rows = await tx.update(subscriptions).set(values).where(eq(subscriptions.id, id)).returning();
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Faturas                                                                     */
/* -------------------------------------------------------------------------- */

export async function listInvoicesByTenant(tx: Executor, tenantId: string, limit = 12) {
  return tx
    .select()
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.tenantId, tenantId))
    .orderBy(desc(subscriptionInvoices.dueDate))
    .limit(limit);
}

/**
 * Grava ou atualiza a fatura vinda do gateway.
 *
 * `onConflictDoUpdate` pela chave do provedor: o Asaas reenvia o mesmo
 * pagamento em eventos diferentes (criado, vencido, confirmado), e cada um
 * deve mover a MESMA linha em vez de criar uma nova.
 */
export async function upsertInvoice(
  tx: Executor,
  values: typeof subscriptionInvoices.$inferInsert & { providerInvoiceId: string },
) {
  const rows = await tx
    .insert(subscriptionInvoices)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptionInvoices.providerInvoiceId,
      set: {
        status: values.status,
        paidAt: values.paidAt ?? null,
        amountCents: values.amountCents,
        ...(values.paymentUrl ? { paymentUrl: values.paymentUrl } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0]!;
}

export async function markOverdueInvoices(tx: Executor, now: Date): Promise<string[]> {
  const rows = await tx
    .update(subscriptionInvoices)
    .set({ status: 'overdue', updatedAt: now })
    .where(
      and(
        eq(subscriptionInvoices.status, 'pending'),
        lt(subscriptionInvoices.dueDate, now),
      ),
    )
    .returning({ tenantId: subscriptionInvoices.tenantId });

  return rows.map((row) => row.tenantId);
}

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Registra o evento e diz se ele é NOVO.
 *
 * `onConflictDoNothing` + `returning` vazio é a idempotência inteira: o Asaas
 * reentrega o mesmo evento até receber 200, e sem isto uma fatura seria
 * baixada duas vezes. A gravação acontece ANTES do processamento, para que um
 * evento que quebra o processamento continue auditável.
 */
export async function recordWebhookEvent(
  tx: Executor,
  values: typeof webhookEvents.$inferInsert,
): Promise<{ id: string; isNew: boolean }> {
  const inserted = await tx
    .insert(webhookEvents)
    .values(values)
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.providerEventId],
    })
    .returning({ id: webhookEvents.id });

  if (inserted[0]) return { id: inserted[0].id, isNew: true };

  const existing = await tx
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, values.provider),
        eq(webhookEvents.providerEventId, values.providerEventId),
      ),
    )
    .limit(1);

  return { id: existing[0]?.id ?? '', isNew: false };
}

export async function markWebhookProcessed(
  tx: Executor,
  id: string,
  error?: string,
): Promise<void> {
  await tx
    .update(webhookEvents)
    .set({
      // Um evento que falhou não é marcado como processado: é o que permite
      // reprocessá-lo depois de corrigir a causa.
      processedAt: error ? null : new Date(),
      error: error ?? null,
      attempts: sql`${webhookEvents.attempts} + 1`,
    })
    .where(eq(webhookEvents.id, id));
}

/* -------------------------------------------------------------------------- */
/* Métricas                                                                    */
/* -------------------------------------------------------------------------- */

export async function metrics(tx: Executor, since: Date) {
  const [byStatus] = await tx
    .select({
      total: sql<number>`count(*)`,
      trial: sql<number>`count(*) filter (where ${tenants.status} = 'trial')`,
      active: sql<number>`count(*) filter (where ${tenants.status} = 'active')`,
      pastDue: sql<number>`count(*) filter (where ${tenants.status} = 'past_due')`,
      suspended: sql<number>`count(*) filter (where ${tenants.status} = 'suspended')`,
      canceled: sql<number>`count(*) filter (where ${tenants.status} = 'canceled')`,
      newTenants: sql<number>`count(*) filter (where ${tenants.createdAt} >= ${since})`,
    })
    .from(tenants)
    .where(isNull(tenants.deletedAt));

  // MRR conta apenas assinatura ATIVA. Incluir `past_due` inflaria a receita
  // com dinheiro que não entrou — que é exatamente o erro que a métrica
  // deveria denunciar.
  const [mrr] = await tx
    .select({ total: sql<number>`coalesce(sum(${plans.priceCents}), 0)` })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.status, 'active'));

  const [overdue] = await tx
    .select({
      count: sql<number>`count(*)`,
      amountCents: sql<number>`coalesce(sum(${subscriptionInvoices.amountCents}), 0)`,
    })
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.status, 'overdue'));

  const [failed] = await tx
    .select({ total: sql<number>`count(*)` })
    .from(webhookEvents)
    .where(and(isNull(webhookEvents.processedAt), gte(webhookEvents.attempts, 1)));

  return {
    byStatus: {
      total: Number(byStatus?.total ?? 0),
      trial: Number(byStatus?.trial ?? 0),
      active: Number(byStatus?.active ?? 0),
      pastDue: Number(byStatus?.pastDue ?? 0),
      suspended: Number(byStatus?.suspended ?? 0),
      canceled: Number(byStatus?.canceled ?? 0),
      newTenants: Number(byStatus?.newTenants ?? 0),
    },
    mrrCents: Number(mrr?.total ?? 0),
    overdue: {
      count: Number(overdue?.count ?? 0),
      amountCents: Number(overdue?.amountCents ?? 0),
    },
    failedWebhooks: Number(failed?.total ?? 0),
  };
}

/** Empresas cujo teste acabou e que nunca assinaram. */
export async function expiredTrials(tx: Executor, now: Date) {
  return tx
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(
      and(
        eq(tenants.status, 'trial'),
        isNull(tenants.deletedAt),
        lt(tenants.trialEndsAt, now),
      ),
    )
    .limit(200);
}
