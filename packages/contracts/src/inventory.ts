import { z } from 'zod';

import {
  cursorQuerySchema,
  positiveCentsSchema,
  purchaseUnitSchema,
  qtySchema,
  stockKindSchema,
  usageUnitSchema,
  uuidSchema,
} from './common';

/**
 * Estoque, insumos e compras (§6.5 do PLAN.md).
 *
 * Quantidades são números com até 4 casas — a mesma precisão do banco.
 * Custo unitário tem 6 casas e está em centavos FRACIONÁRIOS: 1 g de farinha
 * custa 0,2 centavo, e inteiro não representa isso (P3, refinado).
 */

export const movementTypeSchema = z.enum([
  'purchase',
  'production_in',
  'production_out',
  'reservation',
  'reservation_release',
  'sale',
  'adjustment',
  'loss',
  'return',
]);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const movementSourceSchema = z.enum([
  'delivery_order',
  'preorder',
  'supply_purchase',
  'production',
  'manual',
]);

/* -------------------------------------------------------------------------- */
/* Saldos                                                                      */
/* -------------------------------------------------------------------------- */

export const stockBalanceSchema = z.object({
  kind: stockKindSchema,
  refId: uuidSchema,
  /** Nome do produto/variação ou do insumo, para a tela não precisar juntar. */
  refName: z.string(),
  unit: z.string(),
  qtyOnHand: z.number(),
  qtyReserved: z.number(),
  /** `qtyOnHand − qtyReserved`. É este número que a vitrine mostra. */
  qtyAvailable: z.number(),
  minStockQty: z.number().nullable(),
  isLow: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type StockBalance = z.infer<typeof stockBalanceSchema>;

/**
 * `kind` é obrigatório: produto e insumo têm nomes, unidades e telas
 * diferentes, e paginar por cursor sobre a união dos dois não daria uma
 * ordem estável.
 */
export const listStockQuerySchema = cursorQuerySchema.extend({
  kind: stockKindSchema,
  /** Só o que está abaixo do mínimo. */
  lowOnly: z.coerce.boolean().optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
export type ListStockQuery = z.infer<typeof listStockQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Extrato                                                                     */
/* -------------------------------------------------------------------------- */

export const stockMovementSchema = z.object({
  id: uuidSchema,
  kind: stockKindSchema,
  refId: uuidSchema,
  refName: z.string().nullable(),
  type: movementTypeSchema,
  qtyDelta: z.number(),
  balanceAfter: z.number(),
  /** Ausente para `staff` — custo é informação de quem decide preço. */
  unitCost: z.number().nullable().optional(),
  reason: z.string().nullable(),
  source: movementSourceSchema,
  sourceId: uuidSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const listMovementsQuerySchema = cursorQuerySchema.extend({
  kind: stockKindSchema.optional(),
  refId: uuidSchema.optional(),
  type: movementTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Ajuste e perda                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Ajuste: "recontei e o saldo estava errado". `qtyDelta` pode ser negativo.
 * `reason` é obrigatório — é o único registro do porquê, já que o ajuste não
 * tem documento de origem.
 */
export const createAdjustmentRequestSchema = z.object({
  kind: stockKindSchema,
  refId: uuidSchema,
  qtyDelta: z.number().finite().refine((value) => value !== 0, {
    message: 'O ajuste precisa ser diferente de zero.',
  }),
  reason: z.string().trim().min(3).max(200),
});
export type CreateAdjustmentRequest = z.infer<typeof createAdjustmentRequestSchema>;

/**
 * Perda é separada do ajuste de propósito: "quebrei 3 ovos" e "recontei e
 * tinha menos" são causas diferentes, e o relatório de custos precisa
 * distingui-las.
 */
export const createLossRequestSchema = z.object({
  kind: stockKindSchema,
  refId: uuidSchema,
  qty: qtySchema,
  reason: z.string().trim().min(3).max(200),
});
export type CreateLossRequest = z.infer<typeof createLossRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Insumos                                                                     */
/* -------------------------------------------------------------------------- */

export const supplyTypeSchema = z.enum(['ingredient', 'packaging']);

export const supplySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: supplyTypeSchema,
  usageUnit: usageUnitSchema,
  /**
   * Centavos fracionários por unidade de uso. Derivado das compras.
   * Ausente para `staff`: a API corta o campo na resposta.
   */
  avgUnitCost: z.number().optional(),
  minStockQty: z.number(),
  qtyOnHand: z.number(),
  qtyReserved: z.number(),
  qtyAvailable: z.number(),
  isLow: z.boolean(),
  active: z.boolean(),
});
export type Supply = z.infer<typeof supplySchema>;

export const createSupplyRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: supplyTypeSchema.default('ingredient'),
  usageUnit: usageUnitSchema,
  minStockQty: z.number().finite().min(0).default(0),
  active: z.boolean().default(true),
});
export type CreateSupplyRequest = z.infer<typeof createSupplyRequestSchema>;

export const updateSupplyRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    type: supplyTypeSchema.optional(),
    minStockQty: z.number().finite().min(0).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateSupplyRequest = z.infer<typeof updateSupplyRequestSchema>;

export const listSuppliesQuerySchema = cursorQuerySchema.extend({
  type: supplyTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
  lowOnly: z.coerce.boolean().optional(),
  q: z.string().trim().min(2).max(60).optional(),
});
export type ListSuppliesQuery = z.infer<typeof listSuppliesQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Fornecedores                                                                */
/* -------------------------------------------------------------------------- */

export const supplierSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
});
export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;

export const updateSupplierRequestSchema = createSupplierRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Compras (D11)                                                               */
/* -------------------------------------------------------------------------- */

export const supplyPurchaseSchema = z.object({
  id: uuidSchema,
  supplyId: uuidSchema,
  supplyName: z.string(),
  supplierId: uuidSchema.nullable(),
  supplierName: z.string().nullable(),
  purchaseQty: z.number(),
  purchaseUnit: purchaseUnitSchema,
  conversionFactor: z.number(),
  totalCents: positiveCentsSchema,
  /** Custo desta compra, por unidade de uso. Ausente para `staff`. */
  unitCost: z.number().optional(),
  /** Custo médio do insumo DEPOIS desta compra. Ausente para `staff`. */
  avgUnitCostAfter: z.number().optional(),
  purchasedAt: z.string().datetime(),
  invoiceRef: z.string().nullable(),
  note: z.string().nullable(),
});
export type SupplyPurchase = z.infer<typeof supplyPurchaseSchema>;

/**
 * A compra faz duas coisas na mesma transação: dá entrada no estoque e
 * recalcula o custo médio ponderado. Separá-las é o que faz o custo
 * envelhecer sem ninguém perceber.
 */
export const createPurchaseRequestSchema = z.object({
  supplyId: uuidSchema,
  supplierId: uuidSchema.nullable().optional(),
  purchaseQty: qtySchema,
  purchaseUnit: purchaseUnitSchema,
  /**
   * Quantas unidades de uso vêm em 1 unidade de compra.
   * Obrigatório só para embalagens (`cx`, `pct`, `sc`, `fd`): kg→g e l→ml
   * têm conversão física e são preenchidos pelo servidor.
   */
  conversionFactor: z.number().finite().positive().optional(),
  totalCents: positiveCentsSchema,
  purchasedAt: z.string().datetime().optional(),
  invoiceRef: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreatePurchaseRequest = z.infer<typeof createPurchaseRequestSchema>;

export const listPurchasesQuerySchema = cursorQuerySchema.extend({
  supplyId: uuidSchema.optional(),
  supplierId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
