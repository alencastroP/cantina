import type {
  AcceptInviteRequest,
  InviteUserRequest,
  ListUsersQuery,
  Page,
  PendingInvite,
  UpdateUserRequest,
  User,
} from '@cantina/contracts';
import { withTenant, type Transaction } from '@cantina/db';

import { env } from '../../config/env';
import { appDb } from '../../db';
import { AppError, conflict, forbidden, notFound } from '../../http/errors/app-error';
import { mailProvider } from '../../integrations/mail';
import { recordAudit } from '../../shared/audit';
import { hashPassword } from '../../shared/password';
import { generateOpaqueToken, hashToken } from '../../shared/tokens';
import { createSessionForUser, type RequestMeta, type SessionResult } from '../auth/auth.service';
import { findTenantBySlug } from '../tenants/tenant-resolver';
import * as repository from './users.repository';

/** Convite vale uma semana — tempo de alguém voltar de folga e ainda usar. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toUser(row: repository.UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toInvite(row: repository.InviteRow): PendingInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function list(tx: Transaction, query: ListUsersQuery): Promise<Page<User>> {
  // Pede um a mais para saber se existe próxima página sem um COUNT.
  const rows = await repository.listUsers(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    status: query.status,
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toUser);

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function listInvites(tx: Transaction): Promise<PendingInvite[]> {
  const rows = await repository.listPendingInvites(tx);
  return rows.map(toInvite);
}

/* -------------------------------------------------------------------------- */
/* Convidar                                                                    */
/* -------------------------------------------------------------------------- */

export async function invite(
  tx: Transaction,
  tenantId: string,
  tenantName: string,
  tenantSlug: string,
  input: InviteUserRequest,
  invitedByUserId: string,
): Promise<PendingInvite> {
  const existing = await repository.findUserByEmail(tx, input.email);

  if (existing && existing.status !== 'invited') {
    throw conflict('Já existe um usuário com este e-mail nesta empresa.', {
      email: input.email,
    });
  }

  const user =
    existing ??
    (await repository.createInvitedUser(tx, {
      tenantId,
      name: input.name,
      email: input.email,
      role: input.role,
    }));

  // Reconvite: o papel pode ter mudado desde a primeira tentativa.
  if (existing && (existing.role !== input.role || existing.name !== input.name)) {
    await repository.updateUser(tx, user.id, { name: input.name, role: input.role });
  }

  await repository.deleteInvitesForEmail(tx, input.email);

  const token = generateOpaqueToken();
  const created = await repository.createInvite(tx, {
    tenantId,
    email: input.email,
    role: input.role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    invitedByUserId,
  });

  const link = `${env.WEB_URL}/convite?tenant=${tenantSlug}&token=${token}`;

  await mailProvider.send({
    to: input.email,
    subject: `Você foi convidado para ${tenantName} — Cantina`,
    text: `Você foi convidado para acessar o painel de ${tenantName}.\n\nDefina sua senha em: ${link}\n\nO convite vale por 7 dias.`,
    html: `<p>Você foi convidado para acessar o painel de <strong>${tenantName}</strong>.</p><p><a href="${link}">Definir minha senha</a></p><p>O convite vale por 7 dias.</p>`,
  });

  await recordAudit(tx, {
    tenantId,
    action: 'user.invited',
    entityType: 'user',
    entityId: user.id,
    after: { email: input.email, role: input.role },
  });

  return toInvite(created);
}

export async function revokeInvite(
  tx: Transaction,
  tenantId: string,
  inviteId: string,
): Promise<void> {
  const removed = await repository.deleteInvite(tx, inviteId);
  if (!removed) throw notFound('Convite não encontrado ou já aceito.');

  await recordAudit(tx, {
    tenantId,
    action: 'user.invite_revoked',
    entityType: 'user_invite',
    entityId: inviteId,
  });
}

/* -------------------------------------------------------------------------- */
/* Aceitar convite                                                             */
/* -------------------------------------------------------------------------- */

const invalidInvite = () =>
  new AppError(400, 'invalid_invite', 'Convite inválido, expirado ou já utilizado.');

export async function inviteDetails(input: { tenantSlug: string; token: string }) {
  const tenant = await findTenantBySlug(input.tenantSlug);
  if (!tenant) throw invalidInvite();

  return withTenant(appDb.db, tenant.id, async (tx) => {
    const found = await repository.findInviteByHash(tx, hashToken(input.token));
    if (!found || found.acceptedAt || found.expiresAt.getTime() <= Date.now()) {
      throw invalidInvite();
    }
    return { email: found.email, role: found.role, tenantName: tenant.name };
  });
}

export async function acceptInvite(
  input: AcceptInviteRequest,
  meta: RequestMeta,
): Promise<SessionResult> {
  const tenant = await findTenantBySlug(input.tenantSlug);
  if (!tenant) throw invalidInvite();

  if (tenant.status === 'suspended' || tenant.status === 'canceled') {
    throw new AppError(403, 'tenant_unavailable', 'Assinatura inativa.');
  }

  return withTenant(appDb.db, tenant.id, async (tx) => {
    const found = await repository.findInviteByHash(tx, hashToken(input.token));
    if (!found || found.acceptedAt || found.expiresAt.getTime() <= Date.now()) {
      throw invalidInvite();
    }

    const user = await repository.findUserByEmail(tx, found.email);
    if (!user) throw invalidInvite();

    await repository.activateInvitedUser(tx, user.id, await hashPassword(input.password));
    await repository.markInviteAccepted(tx, found.id);

    await recordAudit(tx, {
      tenantId: tenant.id,
      action: 'user.invite_accepted',
      entityType: 'user',
      entityId: user.id,
      actorType: 'user',
      actorId: user.id,
    });

    // Já entra logado: mandar para o login digitar a senha recém-criada é
    // atrito sem contrapartida de segurança.
    return createSessionForUser(tx, user.id, tenant, meta);
  });
}

/* -------------------------------------------------------------------------- */
/* Alterar e desativar                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Impede a empresa de ficar sem dono.
 *
 * Sem esta guarda, o único `owner` pode se rebaixar a `staff` e ninguém mais
 * consegue gerenciar usuários nem faturamento — situação que só se resolve
 * com SQL na produção.
 */
async function assertNotLastOwner(
  tx: Transaction,
  target: repository.UserRow,
  patch: UpdateUserRequest,
): Promise<void> {
  const losesOwnership =
    target.role === 'owner' &&
    target.status === 'active' &&
    ((patch.role !== undefined && patch.role !== 'owner') || patch.status === 'disabled');

  if (!losesOwnership) return;

  const owners = await repository.countActiveOwners(tx);
  if (owners <= 1) {
    throw conflict('Esta empresa precisa de ao menos um dono ativo.');
  }
}

export async function update(
  tx: Transaction,
  tenantId: string,
  actorId: string,
  userId: string,
  patch: UpdateUserRequest,
): Promise<User> {
  const target = await repository.findUserById(tx, userId);
  if (!target) throw notFound('Usuário não encontrado.');

  if (userId === actorId && patch.status === 'disabled') {
    throw forbidden('Você não pode desativar a própria conta.');
  }

  await assertNotLastOwner(tx, target, patch);

  const updated = await repository.updateUser(tx, userId, patch);
  if (!updated) throw notFound('Usuário não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'user.updated',
    entityType: 'user',
    entityId: userId,
    before: { name: target.name, role: target.role, status: target.status },
    after: { name: updated.name, role: updated.role, status: updated.status },
  });

  return toUser(updated);
}

export async function remove(
  tx: Transaction,
  tenantId: string,
  actorId: string,
  userId: string,
): Promise<void> {
  const target = await repository.findUserById(tx, userId);
  if (!target) throw notFound('Usuário não encontrado.');

  if (userId === actorId) {
    throw forbidden('Você não pode remover a própria conta.');
  }

  await assertNotLastOwner(tx, target, { status: 'disabled' });
  await repository.softDeleteUser(tx, userId);

  await recordAudit(tx, {
    tenantId,
    action: 'user.removed',
    entityType: 'user',
    entityId: userId,
    before: { email: target.email, role: target.role },
  });
}
