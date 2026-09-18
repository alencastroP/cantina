import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { money, primaryId, deletedAt, timestamps } from './_columns';
import {
  domainTypeEnum,
  invoiceStatusEnum,
  platformRoleEnum,
  subscriptionStatusEnum,
  tenantStatusEnum,
} from './enums';

/**
 * Camada de plataforma (§4.1 do PLAN.md).
 *
 * Estas tabelas ficam FORA do RLS de tenant e só são acessadas pelo papel
 * `cantina_platform`. É o único lugar do sistema que enxerga mais de uma
 * empresa ao mesmo tempo.
 */

export interface PlanLimits {
  maxProducts?: number;
  maxOrdersPerMonth?: number;
  maxUsers?: number;
}

export const plans = pgTable('plans', {
  id: primaryId(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  priceCents: money('price_cents'),
  limits: jsonb('limits').$type<PlanLimits>().notNull().default({}),
  active: boolean('active').notNull().default(true),
  ...timestamps(),
}, (table) => [uniqueIndex('plans_code_uq').on(table.code)]);

export const tenants = pgTable(
  'tenants',
  {
    id: primaryId(),
    /** Identificador na URL: `padaria` → padaria.cantina.app (D2). */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    /** CNPJ ou CPF, só dígitos. */
    document: text('document'),
    status: tenantStatusEnum('status').notNull().default('trial'),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    timeZone: text('time_zone').notNull().default('America/Sao_Paulo'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('tenants_slug_uq').on(table.slug),
    index('tenants_status_idx').on(table.status),
  ],
);

/**
 * Hostnames que apontam para uma vitrine.
 * `hostname` é único GLOBALMENTE — é a chave pela qual o middleware do Next
 * descobre de quem é a requisição, antes de existir qualquer tenant no contexto.
 */
export const tenantDomains = pgTable(
  'tenant_domains',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    type: domainTypeEnum('type').notNull().default('subdomain'),
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('tenant_domains_hostname_uq').on(table.hostname),
    index('tenant_domains_tenant_idx').on(table.tenantId),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    /** `asaas` hoje; a porta `BillingProvider` permite outro amanhã (P1). */
    provider: text('provider').notNull().default('asaas'),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    status: subscriptionStatusEnum('status').notNull().default('trialing'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true, mode: 'date' }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'date' }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    index('subscriptions_tenant_idx').on(table.tenantId),
    index('subscriptions_status_idx').on(table.status),
    uniqueIndex('subscriptions_provider_uq').on(table.provider, table.providerSubscriptionId),
  ],
);

export const subscriptionInvoices = pgTable(
  'subscription_invoices',
  {
    id: primaryId(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    providerInvoiceId: text('provider_invoice_id'),
    amountCents: money('amount_cents'),
    status: invoiceStatusEnum('status').notNull().default('pending'),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    paymentUrl: text('payment_url'),
    ...timestamps(),
  },
  (table) => [
    index('subscription_invoices_tenant_idx').on(table.tenantId),
    index('subscription_invoices_status_idx').on(table.status, table.dueDate),
    // O gateway reenvia o mesmo pagamento em eventos diferentes (criado,
    // vencido, confirmado). Sem esta chave, cada evento criaria uma fatura
    // nova e a mesma cobrança apareceria três vezes na conta do cliente.
    uniqueIndex('subscription_invoices_provider_uq').on(table.providerInvoiceId),
  ],
);

/**
 * Eventos recebidos de gateways.
 * `provider_event_id` único é o que torna o webhook idempotente: o Asaas
 * reentrega o mesmo evento quando não recebe 200, e sem isto uma fatura
 * seria baixada duas vezes.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: primaryId(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
  },
  (table) => [
    uniqueIndex('webhook_events_provider_event_uq').on(table.provider, table.providerEventId),
    index('webhook_events_pending_idx').on(table.processedAt),
  ],
);

export const platformUsers = pgTable(
  'platform_users',
  {
    id: primaryId(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: platformRoleEnum('role').notNull().default('support'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [uniqueIndex('platform_users_email_uq').on(table.email)],
);

/**
 * Contador de código legível por empresa: #001, #002…
 * Sequence do Postgres não serve — ela é global, e o pedido nº 1 de cada
 * loja precisa ser o nº 1 dela.
 */
export const tenantCounters = pgTable(
  'tenant_counters',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    lastValue: integer('last_value').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.scope] })],
);

/* --- Relações ------------------------------------------------------------- */

export const plansRelations = relations(plans, ({ many }) => ({
  tenants: many(tenants),
  subscriptions: many(subscriptions),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  plan: one(plans, { fields: [tenants.planId], references: [plans.id] }),
  domains: many(tenantDomains),
  subscriptions: many(subscriptions),
}));

export const tenantDomainsRelations = relations(tenantDomains, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantDomains.tenantId], references: [tenants.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [subscriptions.tenantId], references: [tenants.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  invoices: many(subscriptionInvoices),
}));

export const subscriptionInvoicesRelations = relations(subscriptionInvoices, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionInvoices.subscriptionId],
    references: [subscriptions.id],
  }),
}));
