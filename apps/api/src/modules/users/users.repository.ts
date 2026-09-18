import { userInvites, users, type Executor } from '@cantina/db';
import type { UserRole } from '@cantina/contracts';
import { and, count, desc, eq, gt, isNull, lt } from 'drizzle-orm';

/**
 * Usuários e convites (§6.2 do PLAN.md).
 *
 * O convite cria a linha em `users` já com status `invited`. Assim o dono vê
 * quem foi chamado na mesma lista de sempre, e o índice único
 * `(tenant_id, email)` impede convidar duas vezes o mesmo e-mail sem uma
 * checagem manual que alguém esqueceria.
 */

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'invited' | 'active' | 'disabled';
  lastLoginAt: Date | null;
  createdAt: Date;
}

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

export async function listUsers(
  tx: Executor,
  options: { cursor?: string | undefined; limit: number; status?: UserRow['status'] | undefined },
): Promise<UserRow[]> {
  const filters = [isNull(users.deletedAt)];
  if (options.status) filters.push(eq(users.status, options.status));
  // UUID v7 é ordenável no tempo (P4): o cursor é o próprio id.
  if (options.cursor) filters.push(lt(users.id, options.cursor));

  return tx
    .select(userColumns)
    .from(users)
    .where(and(...filters))
    .orderBy(desc(users.id))
    .limit(options.limit);
}

export async function findUserById(tx: Executor, userId: string): Promise<UserRow | null> {
  const rows = await tx
    .select(userColumns)
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(tx: Executor, email: string): Promise<UserRow | null> {
  const rows = await tx
    .select(userColumns)
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function countActiveOwners(tx: Executor): Promise<number> {
  const rows = await tx
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.role, 'owner'), eq(users.status, 'active'), isNull(users.deletedAt)));
  return rows[0]?.total ?? 0;
}

export async function createInvitedUser(
  tx: Executor,
  input: { tenantId: string; name: string; email: string; role: UserRole },
): Promise<UserRow> {
  const rows = await tx
    .insert(users)
    .values({ ...input, status: 'invited', passwordHash: null })
    .returning(userColumns);

  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o usuário convidado.');
  return created;
}

export async function updateUser(
  tx: Executor,
  userId: string,
  patch: { name?: string; role?: UserRole; status?: 'active' | 'disabled' },
): Promise<UserRow | null> {
  const rows = await tx
    .update(users)
    .set(patch)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning(userColumns);
  return rows[0] ?? null;
}

export async function softDeleteUser(tx: Executor, userId: string): Promise<void> {
  await tx
    .update(users)
    .set({ deletedAt: new Date(), status: 'disabled' })
    .where(eq(users.id, userId));
}

export async function activateInvitedUser(
  tx: Executor,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await tx.update(users).set({ passwordHash, status: 'active' }).where(eq(users.id, userId));
}

/* -------------------------------------------------------------------------- */
/* Convites                                                                    */
/* -------------------------------------------------------------------------- */

export interface InviteRow {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

const inviteColumns = {
  id: userInvites.id,
  email: userInvites.email,
  role: userInvites.role,
  expiresAt: userInvites.expiresAt,
  acceptedAt: userInvites.acceptedAt,
  createdAt: userInvites.createdAt,
};

export async function createInvite(
  tx: Executor,
  input: {
    tenantId: string;
    email: string;
    role: UserRole;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: string | null;
  },
): Promise<InviteRow> {
  const rows = await tx.insert(userInvites).values(input).returning(inviteColumns);
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o convite.');
  return created;
}

export async function findInviteByHash(
  tx: Executor,
  tokenHash: string,
): Promise<InviteRow | null> {
  const rows = await tx
    .select(inviteColumns)
    .from(userInvites)
    .where(eq(userInvites.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPendingInvites(tx: Executor): Promise<InviteRow[]> {
  return tx
    .select(inviteColumns)
    .from(userInvites)
    .where(and(isNull(userInvites.acceptedAt), gt(userInvites.expiresAt, new Date())))
    .orderBy(desc(userInvites.createdAt))
    .limit(100);
}

export async function markInviteAccepted(tx: Executor, inviteId: string): Promise<void> {
  await tx.update(userInvites).set({ acceptedAt: new Date() }).where(eq(userInvites.id, inviteId));
}

/** Reconvidar substitui o convite anterior: o link antigo deixa de valer. */
export async function deleteInvitesForEmail(tx: Executor, email: string): Promise<void> {
  await tx
    .delete(userInvites)
    .where(and(eq(userInvites.email, email), isNull(userInvites.acceptedAt)));
}

export async function deleteInvite(tx: Executor, inviteId: string): Promise<boolean> {
  const rows = await tx
    .delete(userInvites)
    .where(and(eq(userInvites.id, inviteId), isNull(userInvites.acceptedAt)))
    .returning({ id: userInvites.id });
  return rows.length > 0;
}
