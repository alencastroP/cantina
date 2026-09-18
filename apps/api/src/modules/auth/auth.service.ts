import type { AuthTenant, AuthUser, LoginRequest } from '@cantina/contracts';
import { withTenant, type Transaction } from '@cantina/db';

import { env } from '../../config/env';
import { appDb } from '../../db';
import { mailProvider } from '../../integrations/mail';
import { AppError, unauthorized } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { hashPassword, verifyPassword } from '../../shared/password';
import { generateOpaqueToken, hashToken, signAccessToken } from '../../shared/tokens';
import type { ResolvedTenant } from '../../types/express';
import { findTenantById, findTenantBySlug } from '../tenants/tenant-resolver';
import * as repository from './auth.repository';

/**
 * Autenticação (§6.2 do PLAN.md).
 *
 * Login e refresh acontecem ANTES de existir contexto de tenant, então este
 * é o único serviço que abre `withTenant` por conta própria em vez de
 * receber a `tx` do wrapper de rota.
 */

export interface RequestMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface SessionResult {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
  tenant: AuthTenant;
  /** Vai para o cookie httpOnly. Nunca para o corpo da resposta. */
  refresh: { tenantId: string; token: string };
}

/**
 * Uma resposta só para todos os modos de falha do login: e-mail inexistente,
 * senha errada, usuário desativado. Distinguir transforma o login num
 * verificador de e-mails cadastrados.
 */
function invalidCredentials(): AppError {
  return new AppError(401, 'invalid_credentials', 'E-mail ou senha incorretos.');
}

function toAuthUser(user: repository.UserRecord): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function toAuthTenant(tenant: ResolvedTenant): AuthTenant {
  return { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status };
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Emite o par access + refresh e persiste o refresh (só o hash). */
async function issueSession(
  tx: Transaction,
  user: repository.UserRecord,
  tenant: ResolvedTenant,
  meta: RequestMeta,
): Promise<SessionResult> {
  const token = generateOpaqueToken();

  await repository.createRefreshToken(tx, {
    tenantId: tenant.id,
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: refreshExpiry(),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    tid: tenant.id,
    role: user.role,
    scope: 'tenant',
  });

  return {
    accessToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: toAuthUser(user),
    tenant: toAuthTenant(tenant),
    refresh: { tenantId: tenant.id, token },
  };
}

/**
 * Emite sessão para um usuário já autenticado por outro caminho.
 *
 * Usada pelo aceite de convite: quem acabou de definir a senha entra direto,
 * em vez de ser mandado para a tela de login digitar o que acabou de criar.
 * É dependência de SERVIÇO — o módulo `users` não toca no repositório daqui.
 */
export async function createSessionForUser(
  tx: Transaction,
  userId: string,
  tenant: ResolvedTenant,
  meta: RequestMeta,
): Promise<SessionResult> {
  const user = await repository.findUserById(tx, userId);
  if (!user || user.status !== 'active') throw unauthorized('Usuário indisponível.');
  return issueSession(tx, user, tenant, meta);
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

async function resolveLoginTenantId(input: LoginRequest): Promise<string> {
  if (input.tenantSlug) {
    const tenant = await findTenantBySlug(input.tenantSlug);
    if (!tenant) {
      // Empresa inexistente responde como credencial inválida: a alternativa
      // seria um verificador de quais lojas existem na plataforma.
      await verifyPassword(input.password, null);
      throw invalidCredentials();
    }
    return tenant.id;
  }

  const tenantIds = await repository.findTenantIdsByEmail(input.email);

  if (tenantIds.length === 0) {
    await verifyPassword(input.password, null);
    throw invalidCredentials();
  }

  if (tenantIds.length > 1) {
    // A mesma pessoa tem conta em mais de uma loja. Pedimos a empresa sem
    // listar quais — a lista seria informação que o solicitante ainda não
    // provou ter direito de ver.
    throw new AppError(
      400,
      'tenant_required',
      'Este e-mail está em mais de uma empresa. Informe qual delas.',
    );
  }

  return tenantIds[0]!;
}

export async function login(input: LoginRequest, meta: RequestMeta): Promise<SessionResult> {
  const tenantId = await resolveLoginTenantId(input);

  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    await verifyPassword(input.password, null);
    throw invalidCredentials();
  }

  if (tenant.status === 'suspended' || tenant.status === 'canceled') {
    throw new AppError(403, 'tenant_unavailable', 'Assinatura inativa. Fale com o suporte.');
  }

  return withTenant(appDb.db, tenantId, async (tx) => {
    const user = await repository.findUserByEmail(tx, input.email);

    // Sempre verifica uma senha, mesmo sem usuário: sem isso o tempo de
    // resposta revela quais e-mails existem.
    const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? null);

    if (!user || !passwordOk || user.status === 'disabled') {
      throw invalidCredentials();
    }

    if (user.status === 'invited') {
      throw new AppError(
        403,
        'invite_pending',
        'Seu convite ainda não foi aceito. Use o link que você recebeu por e-mail.',
      );
    }

    await repository.touchLastLogin(tx, user.id);
    await recordAudit(tx, {
      tenantId,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      actorLabel: user.email,
    });

    return issueSession(tx, user, tenant, meta);
  });
}

/* -------------------------------------------------------------------------- */
/* Refresh com rotação                                                         */
/* -------------------------------------------------------------------------- */

export async function refresh(
  cookie: { tenantId: string; token: string },
  meta: RequestMeta,
): Promise<SessionResult> {
  const tenant = await findTenantById(cookie.tenantId);
  if (!tenant) throw unauthorized('Sessão inválida.');

  if (tenant.status === 'suspended' || tenant.status === 'canceled') {
    throw new AppError(403, 'tenant_unavailable', 'Assinatura inativa.');
  }

  return withTenant(appDb.db, cookie.tenantId, async (tx) => {
    const stored = await repository.findRefreshTokenByHash(tx, hashToken(cookie.token));
    if (!stored) throw unauthorized('Sessão inválida.');

    /**
     * Detecção de reuso.
     *
     * Um token já rotacionado só reaparece em duas situações: corrida de
     * duas abas, ou alguém usando um token roubado. Não dá para distinguir,
     * então tratamos como comprometimento e derrubamos TODAS as sessões
     * daquele usuário. Custa um relogin no caso benigno; evita uma sessão
     * viva na mão de terceiro no caso ruim.
     */
    if (stored.revokedAt) {
      const revoked = await repository.revokeAllUserTokens(tx, stored.userId);
      await recordAudit(tx, {
        tenantId: cookie.tenantId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'user',
        entityId: stored.userId,
        actorType: 'system',
        after: { revokedSessions: revoked },
      });
      throw unauthorized('Sessão encerrada por segurança. Entre novamente.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw unauthorized('Sessão expirada.');
    }

    const user = await repository.findUserById(tx, stored.userId);
    if (!user || user.status !== 'active') {
      await repository.revokeRefreshToken(tx, stored.id);
      throw unauthorized('Sessão inválida.');
    }

    const session = await issueSession(tx, user, tenant, meta);

    // Rotação: o token antigo morre apontando para o novo, o que dá a trilha
    // necessária para investigar um reuso depois.
    const replacement = await repository.findRefreshTokenByHash(
      tx,
      hashToken(session.refresh.token),
    );
    await repository.revokeRefreshToken(tx, stored.id, replacement?.id);

    return session;
  });
}

export async function logout(cookie: { tenantId: string; token: string } | null): Promise<void> {
  if (!cookie) return;

  const tenant = await findTenantById(cookie.tenantId);
  if (!tenant) return;

  await withTenant(appDb.db, cookie.tenantId, async (tx) => {
    const stored = await repository.findRefreshTokenByHash(tx, hashToken(cookie.token));
    // Logout é sempre 204, mesmo com token inválido: o cliente já limpou o
    // estado dele, e um erro aqui não dá nada a fazer a quem chamou.
    if (stored && !stored.revokedAt) {
      await repository.revokeRefreshToken(tx, stored.id);
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Recuperação de senha                                                        */
/* -------------------------------------------------------------------------- */

const RESET_TTL_MS = 60 * 60 * 1000;

export async function forgotPassword(input: {
  email: string;
  tenantSlug: string;
}): Promise<void> {
  const tenant = await findTenantBySlug(input.tenantSlug);
  // Silencioso de propósito: responder diferente para e-mail inexistente
  // transformaria esta rota num verificador de cadastro.
  if (!tenant) return;

  await withTenant(appDb.db, tenant.id, async (tx) => {
    const user = await repository.findUserByEmail(tx, input.email);
    if (!user || user.status === 'disabled') return;

    const token = generateOpaqueToken();
    await repository.createPasswordReset(tx, {
      tenantId: tenant.id,
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });

    const link = `${env.WEB_URL}/recuperar?tenant=${tenant.slug}&token=${token}`;

    await mailProvider.send({
      to: user.email,
      subject: 'Redefinir sua senha — Cantina',
      text: `Para redefinir a senha de ${tenant.name}, acesse: ${link}\n\nO link vale por 1 hora. Se não foi você, ignore este e-mail.`,
      html: `<p>Para redefinir a senha de <strong>${tenant.name}</strong>, acesse:</p><p><a href="${link}">${link}</a></p><p>O link vale por 1 hora. Se não foi você, ignore este e-mail.</p>`,
    });
  });
}

export async function resetPassword(input: {
  tenantSlug: string;
  token: string;
  password: string;
}): Promise<void> {
  const tenant = await findTenantBySlug(input.tenantSlug);
  if (!tenant) throw new AppError(400, 'invalid_token', 'Link inválido ou expirado.');

  await withTenant(appDb.db, tenant.id, async (tx) => {
    const reset = await repository.findPasswordResetByHash(tx, hashToken(input.token));

    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'invalid_token', 'Link inválido ou expirado.');
    }

    await repository.updatePasswordHash(tx, reset.userId, await hashPassword(input.password));
    await repository.markPasswordResetUsed(tx, reset.id);

    // Trocar a senha encerra as outras sessões — é o que o usuário espera
    // ao fazer isso justamente porque desconfia de acesso indevido.
    const revoked = await repository.revokeAllUserTokens(tx, reset.userId);

    await recordAudit(tx, {
      tenantId: tenant.id,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: reset.userId,
      actorType: 'user',
      actorId: reset.userId,
      after: { revokedSessions: revoked },
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Sessão atual                                                                */
/* -------------------------------------------------------------------------- */

export async function me(
  tx: Transaction,
  userId: string,
  tenant: ResolvedTenant,
): Promise<{ user: AuthUser; tenant: AuthTenant }> {
  const user = await repository.findUserById(tx, userId);
  if (!user || user.status !== 'active') throw unauthorized('Sessão inválida.');

  return { user: toAuthUser(user), tenant: toAuthTenant(tenant) };
}
