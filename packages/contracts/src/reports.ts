import { z } from 'zod';

import { dateOnlySchema, positiveCentsSchema, uuidSchema } from './common';

/**
 * Relatórios (§6.9 do PLAN.md, módulo 10).
 *
 * Todos leem de `v_orders_unified` — delivery e encomenda no mesmo cálculo.
 * É a contrapartida de D6: dois agregados na escrita, um caminho na leitura.
 */

export const reportRangeQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
});

/* -------------------------------------------------------------------------- */
/* Resumo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Três números que costumam ser confundidos, separados de propósito:
 *
 *   `costOfGoodsCents`       o custo dos produtos VENDIDOS (congelado na venda)
 *   `supplyPurchasesCents`   o que saiu do caixa comprando insumo no período
 *   `operatingExpensesCents` as demais despesas pagas
 *
 * Comprar 50 kg de farinha num mês não é despesa daquele mês — é estoque, e
 * vira custo quando o produto sai. Somar os dois contaria a farinha duas
 * vezes e faria um mês de reposição parecer prejuízo.
 */
export const reportSummarySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,

  revenueCents: z.number().int(),
  ordersCount: z.number().int(),
  avgTicketCents: z.number().int(),

  deliveryCount: z.number().int(),
  preorderCount: z.number().int(),
  canceledCount: z.number().int(),

  costOfGoodsCents: z.number().int(),
  grossMarginCents: z.number().int(),
  grossMarginPercent: z.number(),

  operatingExpensesCents: z.number().int(),
  /** Informativo: dinheiro que saiu comprando estoque, fora do resultado. */
  supplyPurchasesCents: z.number().int(),

  /** Receita − custo dos produtos vendidos − despesas operacionais. */
  resultCents: z.number().int(),

  /** Faturamento ainda não recebido, no período. */
  receivableCents: z.number().int(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

/* -------------------------------------------------------------------------- */
/* Vendas                                                                      */
/* -------------------------------------------------------------------------- */

export const salesGroupBySchema = z.enum(['day', 'channel', 'payment_method', 'origin', 'kind']);
export type SalesGroupBy = z.infer<typeof salesGroupBySchema>;

export const salesQuerySchema = reportRangeQuerySchema.extend({
  groupBy: salesGroupBySchema.default('day'),
});

export const salesRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  ordersCount: z.number().int(),
  revenueCents: z.number().int(),
  costCents: z.number().int(),
  marginCents: z.number().int(),
  marginPercent: z.number(),
});
export type SalesRow = z.infer<typeof salesRowSchema>;

export const salesReportSchema = z.object({
  groupBy: salesGroupBySchema,
  rows: z.array(salesRowSchema),
});
export type SalesReport = z.infer<typeof salesReportSchema>;

/* -------------------------------------------------------------------------- */
/* Produtos                                                                    */
/* -------------------------------------------------------------------------- */

export const productsOrderBySchema = z.enum(['revenue', 'qty', 'margin']);

export const productsQuerySchema = reportRangeQuerySchema.extend({
  orderBy: productsOrderBySchema.default('revenue'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productReportRowSchema = z.object({
  productVariantId: uuidSchema.nullable(),
  productName: z.string(),
  variantName: z.string().nullable(),
  qty: z.number(),
  revenueCents: z.number().int(),
  costCents: z.number().int(),
  marginCents: z.number().int(),
  marginPercent: z.number(),
  /** Fatia do faturamento do período, 0-100. */
  revenueSharePercent: z.number(),
});
export type ProductReportRow = z.infer<typeof productReportRowSchema>;

export const productsReportSchema = z.object({
  rows: z.array(productReportRowSchema),
  totalRevenueCents: z.number().int(),
});
export type ProductsReport = z.infer<typeof productsReportSchema>;

/* -------------------------------------------------------------------------- */
/* Custos                                                                      */
/* -------------------------------------------------------------------------- */

export const supplyUsageRowSchema = z.object({
  supplyId: uuidSchema,
  supplyName: z.string(),
  unit: z.string(),
  /** Consumido em vendas e produções. */
  consumedQty: z.number(),
  /** Perdido: quebra, validade, erro de produção. */
  lostQty: z.number(),
  purchasedQty: z.number(),
  purchasedCents: z.number().int(),
  avgUnitCost: z.number(),
});
export type SupplyUsageRow = z.infer<typeof supplyUsageRowSchema>;

export const costsReportSchema = z.object({
  rows: z.array(supplyUsageRowSchema),
  totalPurchasedCents: z.number().int(),
  /** Valor estimado do que se perdeu, ao custo médio atual. */
  totalLossCents: z.number().int(),
});
export type CostsReport = z.infer<typeof costsReportSchema>;
