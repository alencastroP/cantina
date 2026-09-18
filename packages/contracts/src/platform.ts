import { z } from 'zod';

import {
  invoiceStatusSchema,
  planLimitsSchema,
  planSchema,
  subscriptionStatusSchema,
  tenantStatusSchema,
} from './billing';
import { cursorQuerySchema, uuidSchema } from './common';

/**
 * Administração da plataforma (§6.11 do PLAN.md, D5).
 *
 * Tudo aqui roda na conexão com BYPASSRLS e enxerga todos os assinantes de
 * uma vez — é a única área do sistema com esse poder. Por isso a sessão é
 * SEPARADA da do lojista: outro usuário, outro token, outro middleware. Um
 * token de painel não abre uma rota de plataforma nem por engano de rota.
 */

export const platformRoleSchema = z.enum(['owner', 'support']);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

/**
 * Claims do token de plataforma.
 *
 * Sem `tid`: um administrador da plataforma não pertence a empresa nenhuma.
 * A ausência do campo é o que faz `verifyAccessToken` (que exige `tid`)
 * rejeitar este token nas rotas de painel — a separação é estrutural, não
 * uma verificação que alguém pode esquecer de escrever.
 */
export const platformTokenClaimsSchema = z.object({
  sub: uuidSchema,
  role: platformRoleSchema,
  scope: z.literal('platform'),
});
export type PlatformTokenClaims = z.infer<typeof platformTokenClaimsSchema>;

export const platformLoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});
export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;

export const platformUserSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  role: platformRoleSchema,
});
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const platformSessionSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: platformUserSchema,
});
export type PlatformSession = z.infer<typeof platformSessionSchema>;

/* -------------------------------------------------------------------------- */
/* Planos                                                                      */
/* -------------------------------------------------------------------------- */

export const createPlanRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  priceCents: z.number().int().min(0),
  limits: planLimitsSchema.default({}),
  active: z.boolean().default(true),
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

// `code` fica de fora: ele é a chave que assinaturas já criadas referenciam,
// e renomear em produção quebraria a conciliação com o gateway.
export const updatePlanRequestSchema = createPlanRequestSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Empresas                                                                    */
/* -------------------------------------------------------------------------- */

export const platformTenantSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  document: z.string().nullable(),
  status: tenantStatusSchema,
  timeZone: z.string(),
  trialEndsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  plan: planSchema.nullable(),
  subscriptionStatus: subscriptionStatusSchema.nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  /** Vencidas e em aberto. É o número que decide quem suspender. */
  overdueInvoices: z.number().int(),
});
export type PlatformTenant = z.infer<typeof platformTenantSchema>;

export const listTenantsQuerySchema = cursorQuerySchema.extend({
  status: tenantStatusSchema.optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;

export const createTenantRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.'),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().toLowerCase().email(),
  /** Senha inicial do dono. Ele troca no primeiro acesso. */
  ownerPassword: z.string().min(8).max(72),
  planCode: z.string().trim().optional(),
  timeZone: z.string().default('America/Sao_Paulo'),
  trialDays: z.number().int().min(0).max(90).default(14),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export const updateTenantRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    legalName: z.string().trim().max(120).nullable().optional(),
    document: z.string().trim().max(20).nullable().optional(),
    timeZone: z.string().optional(),
    planId: uuidSchema.nullable().optional(),
    trialEndsAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateTenantRequest = z.infer<typeof updateTenantRequestSchema>;

/**
 * Mudança de status manual.
 *
 * `reason` é obrigatório: derrubar a vitrine de um cliente é a ação mais
 * destrutiva do sistema, e ela precisa deixar rastro de quem e por quê.
 */
export const changeTenantStatusRequestSchema = z.object({
  status: tenantStatusSchema,
  reason: z.string().trim().min(3).max(300),
});
export type ChangeTenantStatusRequest = z.infer<typeof changeTenantStatusRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Assinaturas e métricas                                                      */
/* -------------------------------------------------------------------------- */

export const platformSubscriptionSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  tenantName: z.string(),
  planName: z.string(),
  priceCents: z.number().int(),
  status: subscriptionStatusSchema,
  provider: z.string(),
  providerSubscriptionId: z.string().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  overdueInvoices: z.number().int(),
});
export type PlatformSubscription = z.infer<typeof platformSubscriptionSchema>;

export const listSubscriptionsQuerySchema = cursorQuerySchema.extend({
  status: subscriptionStatusSchema.optional(),
});
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;

export const platformMetricsSchema = z.object({
  tenants: z.object({
    total: z.number().int(),
    trial: z.number().int(),
    active: z.number().int(),
    pastDue: z.number().int(),
    suspended: z.number().int(),
    canceled: z.number().int(),
  }),
  /** Receita recorrente mensal: soma do preço dos planos das ativas. */
  mrrCents: z.number().int(),
  /** Faturas vencidas e não pagas, em toda a base. */
  overdue: z.object({ count: z.number().int(), amountCents: z.number().int() }),
  /** Empresas criadas nos últimos 30 dias. */
  newTenants30d: z.number().int(),
  /** Webhooks que falharam e continuam sem processar — precisa de olho humano. */
  failedWebhooks: z.number().int(),
});
export type PlatformMetrics = z.infer<typeof platformMetricsSchema>;

export const platformInvoiceSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  tenantName: z.string(),
  amountCents: z.number().int(),
  status: invoiceStatusSchema,
  dueDate: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  paymentUrl: z.string().nullable(),
});
export type PlatformInvoice = z.infer<typeof platformInvoiceSchema>;
