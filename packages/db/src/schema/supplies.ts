import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, money, primaryId, qty, timestamps, unitCost } from './_columns';
import { tenantId } from './_tenant';
import { purchaseUnitEnum, supplyTypeEnum, usageUnitEnum } from './enums';

/**
 * Insumos e compras (§4.5 do PLAN.md, D11).
 *
 * A compra é o documento que faz duas coisas ao mesmo tempo:
 *   1. dá entrada no estoque do insumo;
 *   2. recalcula o custo médio ponderado.
 *
 * É por isso que "cadastrar o custo" e "dar entrada" não são telas separadas:
 * separá-las é o que faz o custo envelhecer sem ninguém perceber.
 */

export const suppliers = pgTable(
  'suppliers',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [index('suppliers_tenant_idx').on(table.tenantId, table.active)],
);

export const supplies = pgTable(
  'supplies',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    /** `packaging` (sacola, embalagem) também é insumo — tem custo e acaba. */
    type: supplyTypeEnum('type').notNull().default('ingredient'),

    /** Unidade em que a receita CONSOME: g, ml ou un. */
    usageUnit: usageUnitEnum('usage_unit').notNull(),

    /**
     * Custo médio ponderado, em centavos FRACIONÁRIOS por unidade de uso.
     * Derivado: só `supply_purchases` escreve aqui.
     */
    avgUnitCost: unitCost('avg_unit_cost').notNull().default(0),

    /** Abaixo disto, o job gera notificação de estoque baixo (D8). */
    minStockQty: qty('min_stock_qty').notNull().default(0),

    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index('supplies_tenant_idx').on(table.tenantId, table.active),
    uniqueIndex('supplies_tenant_name_uq').on(table.tenantId, table.name),
  ],
);

export const supplyPurchases = pgTable(
  'supply_purchases',
  {
    id: primaryId(),
    tenantId: tenantId(),
    supplyId: uuid('supply_id')
      .notNull()
      .references(() => supplies.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),

    /** Quantidade na unidade de compra: 5 (sacos), 2 (caixas), 10 (kg). */
    purchaseQty: qty('purchase_qty').notNull(),
    purchaseUnit: purchaseUnitEnum('purchase_unit').notNull(),
    /**
     * Unidades de uso por unidade de compra. kg → g = 1000.
     * Guardado na COMPRA, não no insumo: o pacote de fermento pode vir de
     * 100 g numa semana e de 500 g na outra, e o histórico precisa continuar
     * fazendo sentido.
     */
    conversionFactor: qty('conversion_factor').notNull(),

    totalCents: money('total_cents'),
    /** Derivado: centavos por unidade de uso nesta compra específica. */
    unitCost: unitCost('unit_cost').notNull(),

    purchasedAt: timestamp('purchased_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    invoiceRef: text('invoice_ref'),
    note: text('note'),
    ...timestamps(),
  },
  (table) => [
    index('supply_purchases_tenant_supply_idx').on(
      table.tenantId,
      table.supplyId,
      table.purchasedAt,
    ),
    index('supply_purchases_tenant_date_idx').on(table.tenantId, table.purchasedAt),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchases: many(supplyPurchases),
}));

export const suppliesRelations = relations(supplies, ({ many }) => ({
  purchases: many(supplyPurchases),
}));

export const supplyPurchasesRelations = relations(supplyPurchases, ({ one }) => ({
  supply: one(supplies, { fields: [supplyPurchases.supplyId], references: [supplies.id] }),
  supplier: one(suppliers, { fields: [supplyPurchases.supplierId], references: [suppliers.id] }),
}));
