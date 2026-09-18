import { z } from 'zod';

import { uuidSchema } from './common';

/**
 * Assinatura, do lado do LOJISTA (§6.11 do PLAN.md, módulo 11).
 *
 * O que o dono da padaria vê e faz: qual plano tem, até quando está pago,
 * como paga a próxima. O lado da plataforma vive em `platform.ts` — são dois
 * públicos com poderes muito diferentes, e misturá-los num arquivo só é o
 * primeiro passo para misturá-los numa rota só.
 */

export const subscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const invoiceStatusSchema = z.enum(['pending', 'paid', 'overdue', 'canceled', 'refunded']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const tenantStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'suspended',
  'canceled',
]);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

/**
 * Limites do plano.
 *
 * Ausente significa **sem limite**, não zero. É a diferença entre "o plano
 * não restringe usuários" e "este plano não permite usuário nenhum" — e
 * tratar `undefined` como 0 trancaria o cliente para fora da própria conta.
 */
export const planLimitsSchema = z.object({
  maxProducts: z.number().int().positive().optional(),
  maxOrdersPerMonth: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int(),
  limits: planLimitsSchema,
  active: z.boolean(),
});
export type Plan = z.infer<typeof planSchema>;

export const subscriptionInvoiceSchema = z.object({
  id: uuidSchema,
  amountCents: z.number().int(),
  status: invoiceStatusSchema,
  dueDate: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  /** Link do boleto ou do Pix. É o que a tela precisa mostrar de fato. */
  paymentUrl: z.string().nullable(),
});
export type SubscriptionInvoice = z.infer<typeof subscriptionInvoiceSchema>;

export const subscriptionSchema = z.object({
  id: uuidSchema,
  status: subscriptionStatusSchema,
  provider: z.string(),
  plan: planSchema,
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  trialEndsAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/** O que a tela de assinatura do painel mostra numa requisição só. */
export const billingOverviewSchema = z.object({
  /** Status da EMPRESA, que é o que liga e desliga o painel e a vitrine. */
  tenantStatus: tenantStatusSchema,
  trialEndsAt: z.string().datetime().nullable(),
  /** Nulo enquanto o lojista não escolheu plano — o caso do trial. */
  subscription: subscriptionSchema.nullable(),
  invoices: z.array(subscriptionInvoiceSchema),
  /** Uso corrente contra o limite do plano. Nulo onde não há limite. */
  usage: z.object({
    products: z.number().int(),
    users: z.number().int(),
    ordersThisMonth: z.number().int(),
  }),
  availablePlans: z.array(planSchema),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

export const billingTypeSchema = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']);
export type BillingType = z.infer<typeof billingTypeSchema>;

export const startSubscriptionRequestSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  billingType: billingTypeSchema.default('PIX'),
  /** CPF ou CNPJ, só dígitos. O gateway exige para emitir cobrança. */
  document: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => value.length === 11 || value.length === 14, {
      message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).',
    }),
  /** Para onde o gateway manda a cobrança. Padrão: o e-mail do dono. */
  email: z.string().email().optional(),
});
export type StartSubscriptionRequest = z.infer<typeof startSubscriptionRequestSchema>;
