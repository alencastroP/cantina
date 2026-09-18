import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, money, phone, primaryId, qty, timestamps } from './_columns';
import { tenantId } from './_tenant';

/**
 * Clientes do lojista (§4.3 do PLAN.md).
 *
 * D4: sem login. O telefone é a chave natural, única por tenant — o checkout
 * faz find-or-create sobre ela. Por isso a consulta pública de pedido exige
 * código + telefone, nunca só telefone.
 *
 * LGPD: cliente não é apagado, é anonimizado (`anonymized_at`). O pedido
 * precisa sobreviver para o histórico financeiro fechar.
 */

export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    /** E.164, ex.: +5511987654321. */
    phone: phone('phone').notNull(),
    email: text('email'),
    notes: text('notes'),

    /* Agregados mantidos pelo módulo de pedidos — evitam um COUNT por linha
       na listagem de clientes, que é a tela mais aberta do painel. */
    ordersCount: integer('orders_count').notNull().default(0),
    totalSpentCents: money('total_spent_cents'),
    firstOrderAt: timestamp('first_order_at', { withTimezone: true, mode: 'date' }),
    lastOrderAt: timestamp('last_order_at', { withTimezone: true, mode: 'date' }),

    anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('customers_tenant_phone_uq').on(table.tenantId, table.phone),
    index('customers_tenant_name_idx').on(table.tenantId, table.name),
    index('customers_tenant_last_order_idx').on(table.tenantId, table.lastOrderAt),
  ],
);

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: primaryId(),
    tenantId: tenantId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    label: text('label'),
    street: text('street').notNull(),
    number: text('number'),
    complement: text('complement'),
    neighborhood: text('neighborhood'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    reference: text('reference'),
    lat: qty('lat'),
    lng: qty('lng'),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [index('customer_addresses_customer_idx').on(table.tenantId, table.customerId)],
);

export const customersRelations = relations(customers, ({ many }) => ({
  addresses: many(customerAddresses),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, {
    fields: [customerAddresses.customerId],
    references: [customers.id],
  }),
}));
