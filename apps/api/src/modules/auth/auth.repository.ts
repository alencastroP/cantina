import {
  passwordResets,
  refreshTokens,
  users,
  type Executor,
} from '@cantina/db';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { platformDb } from '../../db';

/**
 * Acesso a dados de autenticação.
 *
 * Tudo aqui roda dentro do contexto de tenant, com UMA exceção documentada:
 * `findTenantIdsByEmail`. Ver a justificativa na própria função.
 */

export interface UserRecord {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff' | 'finance';
  status: 'invited' | 'active' | 'disabled';
  passwordHash: string | null;
}

export async function findUserByEmail(tx: Executor, email: string): Promise<UserRecord | null> {
  const rows = await tx
    .select({
      id: users.id,
      tenantId: users.tenantId,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

export async function findUserById(tx: Executor, userId: string): Promise<UserRecord | null> {
  const rows = await tx
    .select({
      id: users.id,
      tenantId: users.tenantId,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * A ÚNICA consulta de tenant feita pela conexão de plataforma.
 *
 * Justificativa: o login acontece antes de existir contexto de tenant, e o
 * e-mail é único por empresa (D3) — a mesma pessoa pode ter conta em duas
 * lojas. Sem o `tenantSlug` informado, não há como saber em qual abrir o
 * contexto sem olhar além dele.
 *
 * Mitigação: seleciona APENAS `tenant_id`. Nome, papel e principalmente o
 * hash de senha são lidos depois, já dentro de `withTenant`.
 */
export async function findTenantIdsByEmail(email: string): Promise<string[]> {
  const rows = await platformDb.db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(5);

  return rows.map((row) => row.tenantId);
}

export async function touchLastLogin(tx: Executor, userId: string): Promise<void> {
  await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function updatePasswordHash(
  tx: Executor,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await tx
    .update(users)
    .set({ passwordHash, status: 'active' })
    .where(eq(users.id, userId));
}

/* -------------------------------------------------------------------------- */
/* Refresh tokens                                                              */
/* -------------------------------------------------------------------------- */

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function createRefreshToken(
  tx: Executor,
  input: {
    tenantId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ip?: string | null;
  },
): Promise<string> {
  const rows = await tx
    .insert(refreshTokens)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    })
    .returning({ id: refreshTokens.id });

  const created = rows[0];
  if (!created) throw new Error('Falha ao gravar o refresh token.');
  return created.id;
}

export async function findRefreshTokenByHash(
  tx: Executor,
  tokenHash: string,
): Promise<RefreshTokenRecord | null> {
  const rows = await tx
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      expiresAt: refreshTokens.expiresAt,
      revokedAt: refreshTokens.revokedAt,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}

export async function revokeRefreshToken(
  tx: Executor,
  tokenId: string,
  replacedByTokenId?: string,
): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedByTokenId: replacedByTokenId ?? null })
    .where(eq(refreshTokens.id, tokenId));
}

/** Usada na detecção de reuso: derruba todas as sessões daquele usuário. */
export async function revokeAllUserTokens(tx: Executor, userId: string): Promise<number> {
  const result = await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return result.length;
}

/** Higiene: apaga tokens expirados há mais de 30 dias. */
export async function purgeExpiredTokens(tx: Executor): Promise<void> {
  await tx.delete(refreshTokens).where(sql`${refreshTokens.expiresAt} < now() - interval '30 days'`);
}

/* -------------------------------------------------------------------------- */
/* Reset de senha                                                              */
/* -------------------------------------------------------------------------- */

export async function createPasswordReset(
  tx: Executor,
  input: { tenantId: string; userId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await tx.insert(passwordResets).values(input);
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export async function findPasswordResetByHash(
  tx: Executor,
  tokenHash: string,
): Promise<PasswordResetRecord | null> {
  const rows = await tx
    .select({
      id: passwordResets.id,
      userId: passwordResets.userId,
      expiresAt: passwordResets.expiresAt,
      usedAt: passwordResets.usedAt,
    })
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}

export async function markPasswordResetUsed(tx: Executor, resetId: string): Promise<void> {
  await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, resetId));
}
