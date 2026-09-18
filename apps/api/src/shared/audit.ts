import { auditLogs, type Executor } from '@cantina/db';

import { getContext } from './request-context';

/**
 * Trilha de auditoria (P7).
 *
 * Gravada na MESMA transação do fato auditado — se a mudança faz rollback,
 * o registro some junto. Auditoria que sobrevive a um rollback é pior que
 * nenhuma: descreve algo que não aconteceu.
 */

export type AuditActorType = 'user' | 'platform_user' | 'customer' | 'system';

export interface AuditInput {
  tenantId: string;
  /** Ex.: `user.role_changed`, `settings.updated`, `auth.login`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  actorType?: AuditActorType;
  actorId?: string | null;
  actorLabel?: string | null;
}

/** Campos que nunca entram no log, mesmo dentro de um `before`/`after`. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'tokenHash',
  'token_hash',
  'accessToken',
  'refreshToken',
]);

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACTED_KEYS.has(key) ? '[redigido]' : redact(item);
  }
  return output;
}

export async function recordAudit(tx: Executor, input: AuditInput): Promise<void> {
  const context = getContext();

  await tx.insert(auditLogs).values({
    tenantId: input.tenantId,
    actorType: input.actorType ?? (context?.userId ? 'user' : 'system'),
    actorId: input.actorId ?? context?.userId ?? null,
    actorLabel: input.actorLabel ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before === undefined ? null : redact(input.before),
    after: input.after === undefined ? null : redact(input.after),
    ip: context?.ip ?? null,
  });
}
