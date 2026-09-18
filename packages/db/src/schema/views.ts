import { date, integer, pgView, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Views de leitura (§4.11 do PLAN.md).
 *
 * Declaradas com `.existing()`: o DDL vive em `sql/views.sql` e é aplicado
 * por `db:rls`, não gerado pelo drizzle-kit. O motivo é `security_invoker`,
 * que o gerador não expressa — e sem ele a view rodaria com os privilégios
 * do dono e furaria o RLS.
 *
 * Estas declarações existem só para dar tipo às consultas. Como não são
 * `PgTable`, a derivação de tabelas do RLS as ignora corretamente: a view
 * herda o isolamento das tabelas de base.
 */

/**
 * União de delivery e encomendas.
 *
 * É a contrapartida de D6: dois agregados separados na ESCRITA, um único
 * caminho de cálculo na LEITURA. Todo relatório de faturamento e todo
 * histórico de cliente lê daqui, para não existirem duas fórmulas de receita
 * no sistema.
 */
export const ordersUnified = pgView('v_orders_unified', {
  id: uuid('id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  /** `delivery` ou `preorder`. */
  kind: text('kind').notNull(),
  code: integer('code').notNull(),
  customerId: uuid('customer_id'),
  customerNameSnapshot: text('customer_name_snapshot'),
  status: text('status').notNull(),
  origin: text('origin').notNull(),
  fulfillment: text('fulfillment').notNull(),
  salesChannelId: uuid('sales_channel_id'),
  paymentMethod: text('payment_method'),
  paymentStatus: text('payment_status').notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  deliveryFeeCents: integer('delivery_fee_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  costCents: integer('cost_cents').notNull(),
  placedAt: timestamp('placed_at', { withTimezone: true, mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
  /** Só encomendas têm data combinada. */
  dueDate: date('due_date'),
}).existing();

// `v_stock_balances` existe no banco (ver `sql/views.sql`) mas não é
// declarada aqui: o módulo de estoque calcula `qty_available` em código, e
// uma declaração sem uso só criaria uma segunda definição para divergir.
