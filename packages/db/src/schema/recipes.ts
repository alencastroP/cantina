import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, money, percent, primaryId, qty, timestamps } from './_columns';
import { tenantId } from './_tenant';
import { productVariants } from './catalog';
import { salesChannelKindEnum } from './enums';
import { supplies } from './supplies';

/**
 * Fichas técnicas e canais de venda (§4.5 do PLAN.md).
 *
 * A receita pendura na VARIAÇÃO, não no produto (P13): bolo P e bolo G
 * consomem quantidades diferentes, e é essa diferença que faz o custo real
 * de cada um existir.
 */

export const recipes = pgTable(
  'recipes',
  {
    id: primaryId(),
    tenantId: tenantId(),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    /** Quantas unidades saem de uma execução da receita. */
    yieldQty: qty('yield_qty').notNull().default(1),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    // Uma receita por variação. É o que permite calcular custo sem ambiguidade.
    uniqueIndex('recipes_variant_uq').on(table.tenantId, table.productVariantId),
  ],
);

export const recipeItems = pgTable(
  'recipe_items',
  {
    id: primaryId(),
    tenantId: tenantId(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    supplyId: uuid('supply_id')
      .notNull()
      .references(() => supplies.id, { onDelete: 'restrict' }),
    /** Quantidade para o RENDIMENTO INTEIRO, na unidade de uso do insumo. */
    qty: qty('qty').notNull(),
    /** Perda esperada, 0-100: farinha na tigela, massa na forma. */
    wastePercent: percent('waste_percent').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('recipe_items_uq').on(table.tenantId, table.recipeId, table.supplyId),
    index('recipe_items_supply_idx').on(table.tenantId, table.supplyId),
  ],
);

/**
 * Canais de venda (D13).
 *
 * Cadastrados por empresa porque a comissão do iFood de uma padaria não é a
 * mesma de outra. O pedido guarda o canal, e é isso que permite comparar
 * margem entre canais no relatório em vez de só simular na tela.
 */
export const salesChannels = pgTable(
  'sales_channels',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    kind: salesChannelKindEnum('kind').notNull().default('own_storefront'),
    commissionPercent: percent('commission_percent').notNull().default(0),
    paymentFeePercent: percent('payment_fee_percent').notNull().default(0),
    fixedFeeCents: money('fixed_fee_cents'),
    /** Se o lojista banca o frete em vez de repassá-lo ao cliente. */
    absorbsDeliveryFee: boolean('absorbs_delivery_fee').notNull().default(false),
    /** O canal usado por padrão nos pedidos da própria vitrine. */
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index('sales_channels_tenant_idx').on(table.tenantId, table.active),
    uniqueIndex('sales_channels_tenant_name_uq').on(table.tenantId, table.name),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  variant: one(productVariants, {
    fields: [recipes.productVariantId],
    references: [productVariants.id],
  }),
  items: many(recipeItems),
}));

export const recipeItemsRelations = relations(recipeItems, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeItems.recipeId], references: [recipes.id] }),
  supply: one(supplies, { fields: [recipeItems.supplyId], references: [supplies.id] }),
}));
