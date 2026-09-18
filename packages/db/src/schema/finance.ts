import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, money, primaryId, timestamps } from './_columns';
import { tenantId } from './_tenant';
import {
  financeAccountKindEnum,
  financeDirectionEnum,
  financeEntryStatusEnum,
  financeSourceEnum,
  recurrenceFrequencyEnum,
} from './enums';

/**
 * Financeiro (§4.10 do PLAN.md, D20).
 *
 * Contas a pagar/receber com vencimento — não só um caixa realizado.
 * `source` + `source_id` amarram o lançamento ao documento de origem, e é
 * isso que impede contagem dupla: um pedido concluído gera exatamente uma
 * entrada, e o relatório consegue voltar dela até o pedido.
 */

export const financeAccounts = pgTable(
  'finance_accounts',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    kind: financeAccountKindEnum('kind').notNull().default('cash'),
    openingBalanceCents: money('opening_balance_cents'),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [index('finance_accounts_tenant_idx').on(table.tenantId, table.active)],
);

export const financeCategories = pgTable(
  'finance_categories',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    direction: financeDirectionEnum('direction').notNull(),
    parentId: uuid('parent_id'),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index('finance_categories_tenant_idx').on(table.tenantId, table.direction, table.active),
    uniqueIndex('finance_categories_tenant_name_uq').on(
      table.tenantId,
      table.direction,
      table.name,
    ),
  ],
);

/**
 * Recorrência: aluguel, energia, internet, contador.
 * O job materializa o próximo lançamento em `finance_entries` — a projeção
 * de caixa lê lançamentos concretos, nunca uma regra que precisaria ser
 * reinterpretada a cada consulta.
 */
export const financeRecurrences = pgTable(
  'finance_recurrences',
  {
    id: primaryId(),
    tenantId: tenantId(),
    direction: financeDirectionEnum('direction').notNull(),
    categoryId: uuid('category_id').references(() => financeCategories.id, {
      onDelete: 'set null',
    }),
    accountId: uuid('account_id').references(() => financeAccounts.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    amountCents: money('amount_cents'),
    frequency: recurrenceFrequencyEnum('frequency').notNull().default('monthly'),
    nextDueDate: date('next_due_date').notNull(),
    endsAt: date('ends_at'),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
  },
  (table) => [index('finance_recurrences_due_idx').on(table.tenantId, table.active, table.nextDueDate)],
);

export const financeEntries = pgTable(
  'finance_entries',
  {
    id: primaryId(),
    tenantId: tenantId(),
    direction: financeDirectionEnum('direction').notNull(),
    categoryId: uuid('category_id').references(() => financeCategories.id, {
      onDelete: 'set null',
    }),
    accountId: uuid('account_id').references(() => financeAccounts.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    amountCents: money('amount_cents'),

    /** Vencimento. É o que torna o fluxo de caixa projetado possível. */
    dueDate: date('due_date').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    /** Pode divergir do previsto: desconto, juro, pagamento parcial. */
    paidAmountCents: money('paid_amount_cents'),
    status: financeEntryStatusEnum('status').notNull().default('open'),

    source: financeSourceEnum('source').notNull().default('manual'),
    sourceId: uuid('source_id'),
    recurrenceId: uuid('recurrence_id').references(() => financeRecurrences.id, {
      onDelete: 'set null',
    }),
    attachmentUrl: text('attachment_url'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id'),

    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index('finance_entries_cashflow_idx').on(table.tenantId, table.status, table.dueDate),
    index('finance_entries_paid_idx').on(table.tenantId, table.paidAt),
    // Um lançamento por documento de origem: evita o pedido virar receita duas vezes.
    uniqueIndex('finance_entries_source_uq').on(table.tenantId, table.source, table.sourceId),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const financeEntriesRelations = relations(financeEntries, ({ one }) => ({
  category: one(financeCategories, {
    fields: [financeEntries.categoryId],
    references: [financeCategories.id],
  }),
  account: one(financeAccounts, {
    fields: [financeEntries.accountId],
    references: [financeAccounts.id],
  }),
  recurrence: one(financeRecurrences, {
    fields: [financeEntries.recurrenceId],
    references: [financeRecurrences.id],
  }),
}));

export const financeCategoriesRelations = relations(financeCategories, ({ many }) => ({
  entries: many(financeEntries),
}));

export const financeAccountsRelations = relations(financeAccounts, ({ many }) => ({
  entries: many(financeEntries),
}));
