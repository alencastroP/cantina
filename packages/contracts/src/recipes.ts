import { z } from 'zod';

import {
  cursorQuerySchema,
  percentSchema,
  positiveCentsSchema,
  qtySchema,
  usageUnitSchema,
  uuidSchema,
} from './common';

/**
 * Fichas técnicas, canais de venda e precificação (§6.6 do PLAN.md).
 *
 * A receita pendura na VARIAÇÃO, não no produto (P13): bolo P e bolo G
 * consomem quantidades diferentes, e é essa diferença que faz o custo real
 * de cada um existir.
 */

/* -------------------------------------------------------------------------- */
/* Ficha técnica                                                               */
/* -------------------------------------------------------------------------- */

export const recipeItemInputSchema = z.object({
  supplyId: uuidSchema,
  /** Quantidade para o RENDIMENTO INTEIRO, na unidade de uso do insumo. */
  qty: qtySchema,
  /** Perda esperada, 0-99: farinha na tigela, massa na forma. */
  wastePercent: z.number().min(0).max(99).default(0),
});
export type RecipeItemInput = z.infer<typeof recipeItemInputSchema>;

export const putRecipeRequestSchema = z.object({
  /** Quantas unidades saem de uma execução da receita. */
  yieldQty: qtySchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z
    .array(recipeItemInputSchema)
    .min(1)
    .max(60)
    .refine(
      (items) => new Set(items.map((item) => item.supplyId)).size === items.length,
      { message: 'O mesmo insumo aparece mais de uma vez. Some as quantidades.' },
    ),
});
export type PutRecipeRequest = z.infer<typeof putRecipeRequestSchema>;

export const recipeCostLineSchema = z.object({
  supplyId: uuidSchema,
  supplyName: z.string(),
  unit: usageUnitSchema,
  qty: z.number(),
  wastePercent: percentSchema,
  /** `qty` já com a perda embutida. */
  effectiveQty: z.number(),
  /** Centavos fracionários por unidade de uso. */
  unitCost: z.number(),
  costCents: positiveCentsSchema,
  /** Fatia do custo total da receita, 0-100. Mostra onde o dinheiro está. */
  sharePercent: z.number(),
  /** Insumo que nunca foi comprado: o custo dele entra como zero. */
  costUnknown: z.boolean(),
});
export type RecipeCostLine = z.infer<typeof recipeCostLineSchema>;

export const recipeSchema = z.object({
  variantId: uuidSchema,
  productName: z.string(),
  variantName: z.string(),
  yieldQty: z.number(),
  notes: z.string().nullable(),
  items: z.array(recipeCostLineSchema),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const variantCostSchema = z.object({
  variantId: uuidSchema,
  productName: z.string(),
  variantName: z.string(),
  priceCents: positiveCentsSchema,
  yieldQty: z.number(),
  /** Custo de UMA unidade. É este que congela no item do pedido (D11). */
  unitCostCents: positiveCentsSchema,
  batchCostCents: positiveCentsSchema,
  /** Margem no canal padrão da empresa. */
  marginCents: z.number().int(),
  marginPercent: z.number(),
  lines: z.array(recipeCostLineSchema),
  /**
   * Algum insumo da receita nunca foi comprado, então o custo está
   * SUBESTIMADO — a margem exibida é melhor que a real.
   */
  hasUnknownCost: z.boolean(),
});
export type VariantCost = z.infer<typeof variantCostSchema>;

/**
 * Custo de todas as variações de um produto, numa resposta só.
 *
 * É o que a tela do produto mostra: a ficha técnica de cada variação já com
 * o custo calculado e a margem no canal padrão. Uma chamada por produto em
 * vez de duas por variação (receita + custo).
 */
export const productCostingSchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  stockMode: z.enum(['tracked', 'on_demand']),
  /** Canal usado na margem — o padrão da empresa. `null` = sem taxa nenhuma. */
  channelName: z.string().nullable(),
  variants: z.array(
    variantCostSchema.extend({
      hasRecipe: z.boolean(),
      active: z.boolean(),
    }),
  ),
});
export type ProductCosting = z.infer<typeof productCostingSchema>;

/**
 * Resumo de custo em lote, para listas.
 *
 * A lista de produtos e a de fichas precisam saber "tem ficha?" e "quanto
 * sobra?" de dezenas de variações. Uma consulta por variação seria um N+1
 * na tela que o lojista mais abre.
 */
export const costSummaryQuerySchema = z.object({
  variantIds: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(uuidSchema).min(1).max(200)),
});

export const variantCostSummarySchema = z.object({
  variantId: uuidSchema,
  hasRecipe: z.boolean(),
  unitCostCents: positiveCentsSchema,
  marginCents: z.number().int(),
  marginPercent: z.number(),
  hasUnknownCost: z.boolean(),
});
export type VariantCostSummary = z.infer<typeof variantCostSummarySchema>;

export const costSummarySchema = z.object({
  items: z.array(variantCostSummarySchema),
});
export type CostSummary = z.infer<typeof costSummarySchema>;

/* -------------------------------------------------------------------------- */
/* Canais de venda (D13)                                                       */
/* -------------------------------------------------------------------------- */

export const salesChannelKindSchema = z.enum(['own_storefront', 'marketplace', 'counter']);

export const salesChannelSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: salesChannelKindSchema,
  commissionPercent: percentSchema,
  paymentFeePercent: percentSchema,
  fixedFeeCents: positiveCentsSchema,
  absorbsDeliveryFee: z.boolean(),
  isDefault: z.boolean(),
  active: z.boolean(),
});
export type SalesChannel = z.infer<typeof salesChannelSchema>;

export const createSalesChannelRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    kind: salesChannelKindSchema.default('marketplace'),
    commissionPercent: percentSchema.default(0),
    paymentFeePercent: percentSchema.default(0),
    fixedFeeCents: positiveCentsSchema.default(0),
    absorbsDeliveryFee: z.boolean().default(false),
    isDefault: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((value) => value.commissionPercent + value.paymentFeePercent < 100, {
    message: 'As taxas do canal somam 100% ou mais.',
    path: ['commissionPercent'],
  });
export type CreateSalesChannelRequest = z.infer<typeof createSalesChannelRequestSchema>;

export const updateSalesChannelRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    kind: salesChannelKindSchema.optional(),
    commissionPercent: percentSchema.optional(),
    paymentFeePercent: percentSchema.optional(),
    fixedFeeCents: positiveCentsSchema.optional(),
    absorbsDeliveryFee: z.boolean().optional(),
    isDefault: z.literal(true).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateSalesChannelRequest = z.infer<typeof updateSalesChannelRequestSchema>;

export const listSalesChannelsQuerySchema = cursorQuerySchema.partial().extend({
  active: z.coerce.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* Simulador de margem                                                         */
/* -------------------------------------------------------------------------- */

export const simulateRequestSchema = z.object({
  variantId: uuidSchema,
  /** Omitido, usa o preço cadastrado da variação. */
  priceCents: positiveCentsSchema.optional(),
  /** Omitido, simula em todos os canais ativos. */
  channelIds: z.array(uuidSchema).max(20).optional(),
  deliveryFeeCents: positiveCentsSchema.optional(),
  /** Pedindo isto, cada canal volta também com o preço que atinge a margem. */
  targetMarginPercent: z.number().min(0).max(99).optional(),
});
export type SimulateRequest = z.infer<typeof simulateRequestSchema>;

export const channelSimulationSchema = z.object({
  channelId: uuidSchema,
  channelName: z.string(),
  priceCents: positiveCentsSchema,
  channelFeesCents: z.number().int(),
  deliveryCostCents: z.number().int(),
  netRevenueCents: z.number().int(),
  unitCostCents: z.number().int(),
  marginCents: z.number().int(),
  marginPercent: z.number(),
  markupPercent: z.number(),
  /** Presente quando `targetMarginPercent` foi informado. */
  suggestedPriceCents: positiveCentsSchema.optional(),
});
export type ChannelSimulation = z.infer<typeof channelSimulationSchema>;

export const simulateResponseSchema = z.object({
  variantId: uuidSchema,
  productName: z.string(),
  variantName: z.string(),
  unitCostCents: positiveCentsSchema,
  hasUnknownCost: z.boolean(),
  channels: z.array(channelSimulationSchema),
});
export type SimulateResponse = z.infer<typeof simulateResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Produção (D19)                                                              */
/* -------------------------------------------------------------------------- */

export const createProductionRequestSchema = z.object({
  productVariantId: uuidSchema,
  qty: qtySchema,
  producedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateProductionRequest = z.infer<typeof createProductionRequestSchema>;

export const productionResultSchema = z.object({
  id: uuidSchema,
  productVariantId: uuidSchema,
  productName: z.string(),
  variantName: z.string(),
  qty: z.number(),
  unitCostCents: positiveCentsSchema,
  totalCostCents: positiveCentsSchema,
  /** Saldo da variação depois da produção. */
  qtyOnHandAfter: z.number(),
  consumed: z.array(
    z.object({
      supplyId: uuidSchema,
      supplyName: z.string(),
      unit: usageUnitSchema,
      qty: z.number(),
      qtyOnHandAfter: z.number(),
    }),
  ),
  producedAt: z.string().datetime(),
});
export type ProductionResult = z.infer<typeof productionResultSchema>;

/* -------------------------------------------------------------------------- */
/* Disponibilidade derivada (D9)                                               */
/* -------------------------------------------------------------------------- */

export const variantAvailabilitySchema = z.object({
  variantId: uuidSchema,
  stockMode: z.enum(['tracked', 'on_demand']),
  /** `null` = sem limite conhecido (produto sob demanda e sem receita). */
  availableUnits: z.number().nullable(),
  /** Insumo que está limitando, quando `on_demand`. */
  limitingSupplyId: uuidSchema.nullable(),
  limitingSupplyName: z.string().nullable(),
});
export type VariantAvailability = z.infer<typeof variantAvailabilitySchema>;
