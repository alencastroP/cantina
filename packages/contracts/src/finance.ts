import { z } from 'zod';

import { cursorQuerySchema, dateOnlySchema, positiveCentsSchema, uuidSchema } from './common';

/**
 * Financeiro (§6.9 do PLAN.md, D20).
 *
 * Contas a pagar e a receber com vencimento — não só um caixa realizado. É o
 * vencimento que torna a projeção possível, e é ela que responde "dá para
 * pagar o fornecedor na sexta?".
 */

export const financeDirectionSchema = z.enum(['in', 'out']);
export type FinanceDirection = z.infer<typeof financeDirectionSchema>;

/**
 * `overdue` NÃO é gravado: ele é derivado de `open` + vencimento no passado.
 *
 * Guardar exigiria um job noturno cuja única função seria virar uma flag — e
 * um lançamento vencido às 23h59 ficaria "em aberto" até a rodada seguinte.
 */
export const financeEntryStatusSchema = z.enum(['open', 'paid', 'overdue', 'canceled']);
export type FinanceEntryStatus = z.infer<typeof financeEntryStatusSchema>;

export const financeSourceSchema = z.enum([
  'delivery_order',
  'preorder',
  'supply_purchase',
  'subscription',
  'manual',
]);

/* -------------------------------------------------------------------------- */
/* Contas e categorias                                                         */
/* -------------------------------------------------------------------------- */

export const financeAccountSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: z.enum(['cash', 'bank', 'wallet']),
  openingBalanceCents: z.number().int(),
  isDefault: z.boolean(),
  active: z.boolean(),
  /** Saldo atual: abertura + tudo que foi pago nesta conta. */
  balanceCents: z.number().int(),
});
export type FinanceAccount = z.infer<typeof financeAccountSchema>;

export const createAccountRequestSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['cash', 'bank', 'wallet']).default('cash'),
  openingBalanceCents: z.number().int().default(0),
  isDefault: z.boolean().default(false),
});
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

export const financeCategorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  direction: financeDirectionSchema,
  active: z.boolean(),
});
export type FinanceCategory = z.infer<typeof financeCategorySchema>;

// Nome prefixado: `createCategoryRequestSchema` já existe no catálogo, e dois
// exports iguais no índice do pacote se anulariam em silêncio.
export const createFinanceCategoryRequestSchema = z.object({
  name: z.string().trim().min(2).max(60),
  direction: financeDirectionSchema,
});
export type CreateFinanceCategoryRequest = z.infer<typeof createFinanceCategoryRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Lançamentos                                                                 */
/* -------------------------------------------------------------------------- */

export const financeEntrySchema = z.object({
  id: uuidSchema,
  direction: financeDirectionSchema,
  categoryId: uuidSchema.nullable(),
  categoryName: z.string().nullable(),
  accountId: uuidSchema.nullable(),
  accountName: z.string().nullable(),
  description: z.string(),
  amountCents: positiveCentsSchema,
  dueDate: dateOnlySchema,
  paidAt: z.string().datetime().nullable(),
  paidAmountCents: positiveCentsSchema,
  status: financeEntryStatusSchema,
  source: financeSourceSchema,
  sourceId: uuidSchema.nullable(),
  notes: z.string().nullable(),
});
export type FinanceEntry = z.infer<typeof financeEntrySchema>;

export const createEntryRequestSchema = z.object({
  direction: financeDirectionSchema,
  description: z.string().trim().min(2).max(200),
  amountCents: positiveCentsSchema.refine((value) => value > 0, {
    message: 'O valor precisa ser maior que zero.',
  }),
  dueDate: dateOnlySchema,
  categoryId: uuidSchema.nullable().optional(),
  accountId: uuidSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  /** Marca como pago na hora — o caso do gasto que já saiu do caixa. */
  paidNow: z.boolean().default(false),
});
export type CreateEntryRequest = z.infer<typeof createEntryRequestSchema>;

export const updateEntryRequestSchema = z
  .object({
    description: z.string().trim().min(2).max(200).optional(),
    amountCents: positiveCentsSchema.optional(),
    dueDate: dateOnlySchema.optional(),
    categoryId: uuidSchema.nullable().optional(),
    accountId: uuidSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateEntryRequest = z.infer<typeof updateEntryRequestSchema>;

/** Baixa de pagamento. O valor pago pode divergir: desconto, juro, parcial. */
export const settleEntryRequestSchema = z.object({
  paidAmountCents: positiveCentsSchema.optional(),
  accountId: uuidSchema.optional(),
  paidAt: z.string().datetime().optional(),
});
export type SettleEntryRequest = z.infer<typeof settleEntryRequestSchema>;

export const listEntriesQuerySchema = cursorQuerySchema.extend({
  direction: financeDirectionSchema.optional(),
  status: financeEntryStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Recorrências                                                                */
/* -------------------------------------------------------------------------- */

export const recurrenceFrequencySchema = z.enum([
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'yearly',
]);

export const financeRecurrenceSchema = z.object({
  id: uuidSchema,
  direction: financeDirectionSchema,
  categoryId: uuidSchema.nullable(),
  categoryName: z.string().nullable(),
  accountId: uuidSchema.nullable(),
  description: z.string(),
  amountCents: positiveCentsSchema,
  frequency: recurrenceFrequencySchema,
  nextDueDate: dateOnlySchema,
  endsAt: dateOnlySchema.nullable(),
  active: z.boolean(),
});
export type FinanceRecurrence = z.infer<typeof financeRecurrenceSchema>;

export const createRecurrenceRequestSchema = z.object({
  direction: financeDirectionSchema,
  description: z.string().trim().min(2).max(200),
  amountCents: positiveCentsSchema,
  frequency: recurrenceFrequencySchema.default('monthly'),
  nextDueDate: dateOnlySchema,
  endsAt: dateOnlySchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  accountId: uuidSchema.nullable().optional(),
});
export type CreateRecurrenceRequest = z.infer<typeof createRecurrenceRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Fluxo de caixa                                                              */
/* -------------------------------------------------------------------------- */

export const cashflowDaySchema = z.object({
  date: dateOnlySchema,
  inCents: z.number().int(),
  outCents: z.number().int(),
  /** Saldo acumulado ao fim do dia — realizado até hoje, projetado depois. */
  balanceCents: z.number().int(),
  projected: z.boolean(),
});
export type CashflowDay = z.infer<typeof cashflowDaySchema>;

export const cashflowSchema = z.object({
  openingBalanceCents: z.number().int(),
  days: z.array(cashflowDaySchema),
  totals: z.object({
    inCents: z.number().int(),
    outCents: z.number().int(),
    netCents: z.number().int(),
    /** Vencidos e ainda em aberto — o que precisa de ação hoje. */
    overdueInCents: z.number().int(),
    overdueOutCents: z.number().int(),
  }),
});
export type Cashflow = z.infer<typeof cashflowSchema>;

export const cashflowQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
});
