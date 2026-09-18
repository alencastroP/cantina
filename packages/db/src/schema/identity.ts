import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, primaryId, timestamps } from './_columns';
import { tenantId } from './_tenant';
import { auditActorTypeEnum, userRoleEnum, userStatusEnum } from './enums';
import { tenants } from './platform';

/**
 * Identidade dentro do tenant (§4.2 do PLAN.md).
 * D3: um usuário pertence a UMA empresa. O e-mail é único por tenant,
 * não globalmente — a mesma pessoa pode ser convidada por outra loja depois.
 */

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    tenantId: tenantId(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    role: userRoleEnum('role').notNull().default('staff'),
    status: userStatusEnum('status').notNull().default('invited'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('users_tenant_email_uq').on(table.tenantId, table.email),
    index('users_tenant_idx').on(table.tenantId, table.status),
  ],
);

export const userInvites = pgTable(
  'user_invites',
  {
    id: primaryId(),
    tenantId: tenantId(),
    email: text('email').notNull(),
    role: userRoleEnum('role').notNull().default('staff'),
    /** Só o hash. O token em claro existe uma vez, no e-mail enviado. */
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('user_invites_token_uq').on(table.tokenHash),
    index('user_invites_tenant_email_idx').on(table.tenantId, table.email),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: primaryId(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    /** Rotação: aponta para o token que substituiu este. Detecta reuso. */
    replacedByTokenId: uuid('replaced_by_token_id'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_uq').on(table.tokenHash),
    index('refresh_tokens_user_idx').on(table.tenantId, table.userId),
  ],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    id: primaryId(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamps().createdAt,
  },
  (table) => [uniqueIndex('password_resets_token_uq').on(table.tokenHash)],
);

/**
 * Trilha de auditoria (P7).
 * Existe desde o dia 1 porque a pergunta "quem cancelou esse pedido?"
 * aparece na primeira semana de uso real, e não dá para responder
 * retroativamente.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    tenantId: tenantId(),
    actorType: auditActorTypeEnum('actor_type').notNull().default('user'),
    actorId: uuid('actor_id'),
    actorLabel: text('actor_label'),
    /** Ex.: `delivery_order.status_changed`, `product.price_changed`. */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    index('audit_logs_tenant_entity_idx').on(table.tenantId, table.entityType, table.entityId),
    index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
