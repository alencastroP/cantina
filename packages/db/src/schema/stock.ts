import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryId, qty, timestamps, unitCost } from './_columns';
import { tenantId } from './_tenant';
import { productVariants } from './catalog';
import { movementSourceEnum, movementTypeEnum, stockKindEnum } from './enums';

/**
 * Estoque como livro-razão (§4.6 do PLAN.md, invariante 3).
 *
 * `stock_items`     saldo materializado, para leitura rápida da vitrine.
 * `stock_movements` livro append-only: nunca editado, nunca apagado.
 *                   Divergência se corrige com um `adjustment` novo.
 *
 * As duas tabelas são polimórficas (`kind` + `ref_id`) porque produto e
 * insumo se movimentam pelas mesmas regras. Duas tabelas paralelas
 * duplicariam a lógica de reserva, que é a parte fácil de errar.
 * O preço disso é não ter FK — garantida no serviço, não no banco.
 */

export const stockItems = pgTable(
  'stock_items',
  {
    id: primaryId(),
    tenantId: tenantId(),
    kind: stockKindEnum('kind').notNull(),
    /** `product_variants.id` ou `supplies.id`, conforme `kind`. */
    refId: uuid('ref_id').notNull(),

    /** Físico. Só movimentos de entrada/saída mexem aqui. */
    qtyOnHand: qty('qty_on_hand').notNull().default(0),
    /** Preso por pedido ainda não confirmado (D14). */
    qtyReserved: qty('qty_reserved').notNull().default(0),

    ...timestamps(),
  },
  (table) => [
    uniqueIndex('stock_items_uq').on(table.tenantId, table.kind, table.refId),
    index('stock_items_tenant_kind_idx').on(table.tenantId, table.kind),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryId(),
    tenantId: tenantId(),
    kind: stockKindEnum('kind').notNull(),
    refId: uuid('ref_id').notNull(),

    type: movementTypeEnum('type').notNull(),
    /** Sempre positiva, exceto em `adjustment`. */
    qtyDelta: qty('qty_delta').notNull(),
    /** Saldo físico depois deste movimento — torna o extrato auditável. */
    balanceAfter: qty('balance_after').notNull(),
    /** Custo unitário no momento, quando aplicável (compra, produção). */
    unitCost: unitCost('unit_cost'),

    /** Obrigatório em `adjustment` e `loss` — os que não têm documento. */
    reason: text('reason'),
    source: movementSourceEnum('source').notNull().default('manual'),
    /** Id do pedido, da compra ou da produção que originou o movimento. */
    sourceId: uuid('source_id'),
    createdByUserId: uuid('created_by_user_id'),

    createdAt: timestamps().createdAt,
  },
  (table) => [
    index('stock_movements_ref_idx').on(
      table.tenantId,
      table.kind,
      table.refId,
      table.createdAt,
    ),
    index('stock_movements_source_idx').on(table.tenantId, table.source, table.sourceId),
    index('stock_movements_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

/**
 * Produção (D19): o elo entre os dois estoques.
 *
 * "Produzi 20 coxinhas" gera, na mesma transação, um `production_in` na
 * variação e um `production_out` por insumo da receita. Sem esta operação,
 * o consumo de insumo do mês nunca fecha com o produto pronto vendido.
 */
export const productionEntries = pgTable(
  'production_entries',
  {
    id: primaryId(),
    tenantId: tenantId(),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    qty: qty('qty').notNull(),
    /** Custo unitário congelado no momento da produção. */
    unitCost: unitCost('unit_cost'),
    producedAt: timestamp('produced_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id'),
    ...timestamps(),
  },
  (table) => [
    index('production_entries_tenant_idx').on(table.tenantId, table.producedAt),
    index('production_entries_variant_idx').on(table.tenantId, table.productVariantId),
  ],
);

export const productionEntriesRelations = relations(productionEntries, ({ one }) => ({
  variant: one(productVariants, {
    fields: [productionEntries.productVariantId],
    references: [productVariants.id],
  }),
}));
