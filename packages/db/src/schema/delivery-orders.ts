import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { money, nullableMoney, primaryId, qty, timestamps } from './_columns';
import { tenantId } from './_tenant';
import { productVariants } from './catalog';
import { customers } from './customers';
import {
  deliveryStatusEnum,
  fulfillmentEnum,
  orderOriginEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from './enums';
import { salesChannels } from './recipes';

/**
 * Pedidos de delivery (§4.7 do PLAN.md).
 *
 * D6: agregado separado das encomendas. O que os une para efeito de
 * relatório é a view `v_orders_unified`, não uma tabela compartilhada.
 */

export interface AddressSnapshot {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  reference?: string;
}

export const deliveryOrders = pgTable(
  'delivery_orders',
  {
    id: primaryId(),
    tenantId: tenantId(),
    /** Sequencial por empresa, vindo de `tenant_counters`. */
    code: integer('code').notNull(),

    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    /** Nome e telefone congelados: o cliente pode ser anonimizado (LGPD). */
    customerNameSnapshot: text('customer_name_snapshot'),
    customerPhoneSnapshot: text('customer_phone_snapshot'),

    status: deliveryStatusEnum('status').notNull().default('pending'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    origin: orderOriginEnum('origin').notNull().default('storefront_checkout'),
    fulfillment: fulfillmentEnum('fulfillment').notNull().default('delivery'),
    salesChannelId: uuid('sales_channel_id').references(() => salesChannels.id, {
      onDelete: 'set null',
    }),

    /* --- Valores. Todos congelados no momento do pedido. --- */
    subtotalCents: money('subtotal_cents'),
    discountCents: money('discount_cents'),
    deliveryFeeCents: money('delivery_fee_cents'),
    totalCents: money('total_cents'),
    /** Soma dos custos dos itens. Sem isto, margem histórica muda sozinha. */
    costCents: money('cost_cents'),

    paymentMethod: paymentMethodEnum('payment_method'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    /** "Troco para R$ 50" — só faz sentido em dinheiro (D8). */
    changeForCents: nullableMoney('change_for_cents'),

    addressSnapshot: jsonb('address_snapshot').$type<AddressSnapshot>(),
    notes: text('notes'),

    /** Invariante 6: a vitrine roda em celular com rede ruim. */
    idempotencyKey: text('idempotency_key'),
    /**
     * Pedido `pending` vindo do WhatsApp que ninguém confirmou.
     * O job devolve a reserva depois disto (D14).
     */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),

    /* --- Marcos do fluxo --- */
    placedAt: timestamp('placed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    readyAt: timestamp('ready_at', { withTimezone: true, mode: 'date' }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    cancelReason: text('cancel_reason'),

    ...timestamps(),
  },
  (table) => [
    uniqueIndex('delivery_orders_tenant_code_uq').on(table.tenantId, table.code),
    uniqueIndex('delivery_orders_idempotency_uq').on(table.tenantId, table.idempotencyKey),
    // O board é a query mais quente do painel.
    index('delivery_orders_board_idx').on(table.tenantId, table.status, table.placedAt),
    index('delivery_orders_customer_idx').on(table.tenantId, table.customerId),
    index('delivery_orders_completed_idx').on(table.tenantId, table.completedAt),
    index('delivery_orders_expiring_idx').on(table.tenantId, table.expiresAt),
  ],
);

export const deliveryOrderItems = pgTable(
  'delivery_order_items',
  {
    id: primaryId(),
    tenantId: tenantId(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => deliveryOrders.id, { onDelete: 'cascade' }),
    productVariantId: uuid('product_variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),

    /* Invariante 4: catálogo muda, histórico não. */
    productNameSnapshot: text('product_name_snapshot').notNull(),
    variantNameSnapshot: text('variant_name_snapshot'),

    qty: qty('qty').notNull(),
    unitPriceCents: money('unit_price_cents'),
    /** Custo congelado — vem de `recipeCost` no instante da venda (D11). */
    unitCostCents: money('unit_cost_cents'),
    totalCents: money('total_cents'),
    notes: text('notes'),

    ...timestamps(),
  },
  (table) => [
    index('delivery_order_items_order_idx').on(table.tenantId, table.orderId),
    index('delivery_order_items_variant_idx').on(table.tenantId, table.productVariantId),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const deliveryOrdersRelations = relations(deliveryOrders, ({ one, many }) => ({
  customer: one(customers, { fields: [deliveryOrders.customerId], references: [customers.id] }),
  salesChannel: one(salesChannels, {
    fields: [deliveryOrders.salesChannelId],
    references: [salesChannels.id],
  }),
  items: many(deliveryOrderItems),
}));

export const deliveryOrderItemsRelations = relations(deliveryOrderItems, ({ one }) => ({
  order: one(deliveryOrders, {
    fields: [deliveryOrderItems.orderId],
    references: [deliveryOrders.id],
  }),
  variant: one(productVariants, {
    fields: [deliveryOrderItems.productVariantId],
    references: [productVariants.id],
  }),
}));
