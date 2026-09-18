import { relations } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { money, nullableMoney, primaryId, qty, timestamps } from './_columns';
import { tenantId } from './_tenant';
import { availabilityDays } from './availability';
import { productVariants } from './catalog';
import { customers } from './customers';
import {
  fulfillmentEnum,
  orderOriginEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  preorderStatusEnum,
} from './enums';
import { type AddressSnapshot } from './delivery-orders';
import { salesChannels } from './recipes';

/**
 * Encomendas (§4.8 do PLAN.md).
 *
 * O que justifica o agregado separado: `due_date`, a vaga na agenda e o
 * sinal. Nenhum dos três existe no delivery, e os três participam de
 * transações diferentes.
 */

export const preorders = pgTable(
  'preorders',
  {
    id: primaryId(),
    tenantId: tenantId(),
    code: integer('code').notNull(),

    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    customerNameSnapshot: text('customer_name_snapshot'),
    customerPhoneSnapshot: text('customer_phone_snapshot'),

    status: preorderStatusEnum('status').notNull().default('pending'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    origin: orderOriginEnum('origin').notNull().default('storefront_checkout'),
    fulfillment: fulfillmentEnum('fulfillment').notNull().default('pickup'),
    salesChannelId: uuid('sales_channel_id').references(() => salesChannels.id, {
      onDelete: 'set null',
    }),

    /* --- Agenda (D10) --- */
    /** Data de calendário, não instante (P5). */
    dueDate: date('due_date').notNull(),
    /** Horário combinado de retirada/entrega. Informativo na v1. */
    dueTime: time('due_time'),
    /** Vaga consumida na agenda. Nulo só em encomenda lançada à mão. */
    availabilityDayId: uuid('availability_day_id').references(() => availabilityDays.id, {
      onDelete: 'set null',
    }),

    /* --- Valores --- */
    subtotalCents: money('subtotal_cents'),
    discountCents: money('discount_cents'),
    deliveryFeeCents: money('delivery_fee_cents'),
    totalCents: money('total_cents'),
    costCents: money('cost_cents'),

    /** Sinal/entrada. Registrado, não cobrado online (D8). */
    depositCents: money('deposit_cents'),
    depositPaidAt: timestamp('deposit_paid_at', { withTimezone: true, mode: 'date' }),

    paymentMethod: paymentMethodEnum('payment_method'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    changeForCents: nullableMoney('change_for_cents'),

    addressSnapshot: jsonb('address_snapshot').$type<AddressSnapshot>(),
    notes: text('notes'),

    idempotencyKey: text('idempotency_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),

    /* --- Marcos --- */
    placedAt: timestamp('placed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    productionStartedAt: timestamp('production_started_at', { withTimezone: true, mode: 'date' }),
    readyAt: timestamp('ready_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    cancelReason: text('cancel_reason'),

    ...timestamps(),
  },
  (table) => [
    uniqueIndex('preorders_tenant_code_uq').on(table.tenantId, table.code),
    uniqueIndex('preorders_idempotency_uq').on(table.tenantId, table.idempotencyKey),
    // O calendário e o board leem por data de entrega, não por data do pedido.
    index('preorders_due_idx').on(table.tenantId, table.dueDate, table.status),
    index('preorders_board_idx').on(table.tenantId, table.status, table.dueDate),
    index('preorders_customer_idx').on(table.tenantId, table.customerId),
    index('preorders_expiring_idx').on(table.tenantId, table.expiresAt),
  ],
);

export const preorderItems = pgTable(
  'preorder_items',
  {
    id: primaryId(),
    tenantId: tenantId(),
    preorderId: uuid('preorder_id')
      .notNull()
      .references(() => preorders.id, { onDelete: 'cascade' }),
    productVariantId: uuid('product_variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),

    productNameSnapshot: text('product_name_snapshot').notNull(),
    variantNameSnapshot: text('variant_name_snapshot'),

    qty: qty('qty').notNull(),
    unitPriceCents: money('unit_price_cents'),
    unitCostCents: money('unit_cost_cents'),
    totalCents: money('total_cents'),
    notes: text('notes'),

    ...timestamps(),
  },
  (table) => [
    index('preorder_items_preorder_idx').on(table.tenantId, table.preorderId),
    index('preorder_items_variant_idx').on(table.tenantId, table.productVariantId),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const preordersRelations = relations(preorders, ({ one, many }) => ({
  customer: one(customers, { fields: [preorders.customerId], references: [customers.id] }),
  availabilityDay: one(availabilityDays, {
    fields: [preorders.availabilityDayId],
    references: [availabilityDays.id],
  }),
  salesChannel: one(salesChannels, {
    fields: [preorders.salesChannelId],
    references: [salesChannels.id],
  }),
  items: many(preorderItems),
}));

export const preorderItemsRelations = relations(preorderItems, ({ one }) => ({
  preorder: one(preorders, { fields: [preorderItems.preorderId], references: [preorders.id] }),
  variant: one(productVariants, {
    fields: [preorderItems.productVariantId],
    references: [productVariants.id],
  }),
}));
