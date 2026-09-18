import type {
  CreatePlanRequest,
  CreateTenantRequest,
  ListSubscriptionsQuery,
  ListTenantsQuery,
  Page,
  Plan,
  PlatformMetrics,
  PlatformSession,
  PlatformSubscription,
  PlatformTenant,
  UpdatePlanRequest,
  UpdateTenantRequest,
} from '@cantina/contracts';
import type { PlanLimits, Transaction } from '@cantina/db';
import { tenantDomains, tenants, users } from '@cantina/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { env } from '../../config/env';
import { conflict, notFound, unauthorized } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { hashPassword, verifyPassword } from '../../shared/password';
import { signPlatformToken } from '../../shared/tokens';
import * as repository from './platform.repository';

/**
 * Administração da plataforma (§6.11 do PLAN.md, D5).
 *
 * Roda inteiro na conexão com BYPASSRLS. Duas regras se aplicam a tudo aqui:
 *
 *   1. `support` lê, `owner` escreve. Quem atende o suporte precisa consultar
 *      a conta do cliente; não precisa poder suspender a loja dele.
 *   2. Toda mudança de status de empresa exige motivo — derrubar a vitrine de
 *      um assinante é a ação mais destrutiva do sistema.
 */

/* -------------------------------------------------------------------------- */
/* Sessão                                                                      */
/* -------------------------------------------------------------------------- */

export async function login(
  tx: Transaction,
  input: { email: string; password: string },
): Promise<PlatformSession> {
  const user = await repository.findPlatformUserByEmail(tx, input.email);

  // Mesma resposta para e-mail inexistente e senha errada. Distinguir os dois
  // transforma o login num confirmador de quem administra a plataforma.
  const invalid = unauthorized('E-mail ou senha inválidos.');
  if (!user) throw invalid;

  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) throw invalid;

  await repository.touchPlatformLogin(tx, user.id);

  return {
    accessToken: await signPlatformToken({ sub: user.id, role: user.role, scope: 'platform' }),
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

type PlanRow = Awaited<ReturnType<typeof repository.findPlanById>>;

export function toPlan(row: NonNullable<PlanRow>): Plan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    limits: (row.limits ?? {}) as PlanLimits,
    active: row.active,
  };
}

export async function listPlans(tx: Transaction, onlyActive = false): Promise<Plan[]> {
  const rows = await repository.listPlans(tx, onlyActive);
  return rows.map(toPlan);
}

export async function createPlan(tx: Transaction, input: CreatePlanRequest): Promise<Plan> {
  const existing = await repository.findPlanByCode(tx, input.code);
  if (existing) {
    throw conflict('Já existe um plano com este código.', { code: input.code });
  }

  const created = await repository.insertPlan(tx, {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    priceCents: input.priceCents,
    limits: input.limits,
    active: input.active,
  });

  return toPlan(created);
}

export async function updatePlan(
  tx: Transaction,
  id: string,
  input: UpdatePlanRequest,
): Promise<Plan> {
  const updated = await repository.updatePlan(tx, id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
    ...(input.limits !== undefined ? { limits: input.limits } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  });

  if (!updated) throw notFound('Plano não encontrado.');
  return toPlan(updated);
}

/* -------------------------------------------------------------------------- */
/* Empresas                                                                    */
/* -------------------------------------------------------------------------- */

type TenantRow = Awaited<ReturnType<typeof repository.findTenant>>;

function toTenant(row: NonNullable<TenantRow>): PlatformTenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legalName: row.legalName,
    document: row.document,
    status: row.status,
    timeZone: row.timeZone,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    plan: row.planId
      ? {
          id: row.planId,
          code: row.planCode ?? '',
          name: row.planName ?? '',
          description: row.planDescription,
          priceCents: row.planPriceCents ?? 0,
          limits: (row.planLimits ?? {}) as PlanLimits,
          active: row.planActive ?? false,
        }
      : null,
    subscriptionStatus: (row.subscriptionStatus as PlatformTenant['subscriptionStatus']) ?? null,
    currentPeriodEnd: row.currentPeriodEnd
      ? new Date(row.currentPeriodEnd).toISOString()
      : null,
    overdueInvoices: Number(row.overdueInvoices),
  };
}

export async function listTenants(
  tx: Transaction,
  query: ListTenantsQuery,
): Promise<Page<PlatformTenant>> {
  const rows = await repository.listTenants(tx, {
    limit: query.limit + 1,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { q: query.q } : {}),
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toTenant);

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function getTenant(tx: Transaction, id: string): Promise<PlatformTenant> {
  const row = await repository.findTenant(tx, id);
  if (!row) throw notFound('Empresa não encontrada.');
  return toTenant(row);
}

/**
 * Cria a empresa, o dono e o subdomínio na MESMA transação.
 *
 * Os três nascem juntos porque uma empresa sem dono não pode ser acessada e
 * uma empresa sem domínio não tem vitrine — e um cadastro pela metade só é
 * descoberto quando o cliente tenta entrar.
 */
export async function createTenant(
  tx: Transaction,
  input: CreateTenantRequest,
): Promise<PlatformTenant> {
  const [slugTaken] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, input.slug))
    .limit(1);

  if (slugTaken) {
    throw conflict('Este endereço já está em uso.', { slug: input.slug });
  }

  const plan = input.planCode ? await repository.findPlanByCode(tx, input.planCode) : null;
  if (input.planCode && !plan) {
    throw notFound('Plano não encontrado.');
  }

  const trialEndsAt = new Date();
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + input.trialDays);

  const tenantId = uuidv7();

  await tx.insert(tenants).values({
    id: tenantId,
    slug: input.slug,
    name: input.name,
    status: 'trial',
    planId: plan?.id ?? null,
    timeZone: input.timeZone,
    trialEndsAt,
  });

  await tx.insert(users).values({
    tenantId,
    name: input.ownerName,
    email: input.ownerEmail,
    passwordHash: await hashPassword(input.ownerPassword),
    role: 'owner',
    status: 'active',
  });

  await tx.insert(tenantDomains).values({
    tenantId,
    hostname: `${input.slug}.${env.ROOT_DOMAIN}`,
    type: 'subdomain',
    isPrimary: true,
    verifiedAt: new Date(),
  });

  return getTenant(tx, tenantId);
}

export async function updateTenant(
  tx: Transaction,
  id: string,
  input: UpdateTenantRequest,
): Promise<PlatformTenant> {
  const updated = await repository.updateTenant(tx, id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
    ...(input.document !== undefined ? { document: input.document } : {}),
    ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
    ...(input.planId !== undefined ? { planId: input.planId } : {}),
    ...(input.trialEndsAt !== undefined
      ? { trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null }
      : {}),
  });

  if (!updated) throw notFound('Empresa não encontrada.');
  return getTenant(tx, id);
}

/**
 * Muda o status manualmente, com motivo registrado.
 *
 * O status da EMPRESA é o que liga e desliga o painel e a vitrine — não o da
 * assinatura. São coisas separadas de propósito: uma assinatura cancelada por
 * erro do gateway não deve derrubar a loja no mesmo instante, e um suporte
 * pode reativar sem mexer na cobrança.
 */
export async function changeStatus(
  tx: Transaction,
  id: string,
  input: { status: PlatformTenant['status']; reason: string },
  actorId: string,
): Promise<PlatformTenant> {
  const current = await repository.findTenant(tx, id);
  if (!current) throw notFound('Empresa não encontrada.');

  await repository.updateTenant(tx, id, { status: input.status });

  // A auditoria carrega o `tenant_id` da empresa afetada, não o do ator: a
  // pergunta que ela responde é "quem derrubou MINHA loja e por quê", e ela
  // é feita olhando o histórico daquela empresa.
  await recordAudit(tx, {
    tenantId: id,
    action: 'tenant.status_changed',
    entityType: 'tenant',
    entityId: id,
    before: { status: current.status },
    after: { status: input.status, reason: input.reason },
    actorType: 'platform_user',
    actorId,
  });

  return getTenant(tx, id);
}

/* -------------------------------------------------------------------------- */
/* Assinaturas e métricas                                                      */
/* -------------------------------------------------------------------------- */

export async function listSubscriptions(
  tx: Transaction,
  query: ListSubscriptionsQuery,
): Promise<Page<PlatformSubscription>> {
  const rows = await repository.listSubscriptions(tx, {
    limit: query.limit + 1,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.status ? { status: query.status } : {}),
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    planName: row.planName,
    priceCents: row.priceCents,
    status: row.status,
    provider: row.provider,
    providerSubscriptionId: row.providerSubscriptionId,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    overdueInvoices: Number(row.overdueInvoices),
  }));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function metrics(tx: Transaction): Promise<PlatformMetrics> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const raw = await repository.metrics(tx, since);

  return {
    tenants: {
      total: raw.byStatus.total,
      trial: raw.byStatus.trial,
      active: raw.byStatus.active,
      pastDue: raw.byStatus.pastDue,
      suspended: raw.byStatus.suspended,
      canceled: raw.byStatus.canceled,
    },
    mrrCents: raw.mrrCents,
    overdue: raw.overdue,
    newTenants30d: raw.byStatus.newTenants,
    failedWebhooks: raw.failedWebhooks,
  };
}
