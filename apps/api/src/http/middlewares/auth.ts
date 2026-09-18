import type { UserRole } from '@cantina/contracts';
import type { RequestHandler } from 'express';

import { findTenantById } from '../../modules/tenants/tenant-resolver';
import { requireContext } from '../../shared/request-context';
import { verifyAccessToken } from '../../shared/tokens';
import { forbidden, notFound, unauthorized } from '../errors/app-error';

/**
 * Autenticação do painel (D16).
 *
 * O tenant vem do TOKEN, nunca da URL (invariante 2). Um usuário pertence a
 * uma única empresa (D3), então o `tid` do token é definitivo — não existe
 * "trocar de empresa" nesta versão.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    let claims;
    try {
      claims = await verifyAccessToken(header.slice('Bearer '.length));
    } catch {
      // Token expirado, assinatura inválida ou formato errado dão a MESMA
      // resposta: distinguir ajuda quem está tentando adivinhar.
      throw unauthorized('Sessão inválida ou expirada.');
    }

    const tenant = await findTenantById(claims.tid);
    if (!tenant) {
      throw notFound('Empresa não encontrada.');
    }

    req.auth = {
      userId: claims.sub,
      tenantId: claims.tid,
      role: claims.role,
      scope: claims.scope,
    };
    req.tenant = tenant;

    const context = requireContext();
    context.tenantId = tenant.id;
    context.userId = claims.sub;
    context.role = claims.role;
    context.scope = claims.scope;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Papéis (D3).
 *
 *   owner    tudo, incluindo faturamento e usuários
 *   manager  operação e cadastro, sem gestão de usuários
 *   staff    kanbans e estoque do dia a dia
 *   finance  só o financeiro e os relatórios (o contador)
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(forbidden('Seu perfil não tem acesso a esta ação.'));
      return;
    }
    next();
  };
}

/** Atalho: tudo que mexe em dinheiro ou em usuários. */
export const requireOwner = requireRole('owner');
export const requireManager = requireRole('owner', 'manager');
export const requireFinance = requireRole('owner', 'finance');
