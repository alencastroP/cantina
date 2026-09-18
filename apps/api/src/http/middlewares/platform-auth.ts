import type { PlatformRole } from '@cantina/contracts';
import type { RequestHandler } from 'express';

import { requireContext } from '../../shared/request-context';
import { verifyPlatformToken } from '../../shared/tokens';
import { forbidden, unauthorized } from '../errors/app-error';

/**
 * Autenticação da administração da plataforma (D5).
 *
 * Sessão separada da do lojista, com usuário em `platform_users`. Não é
 * excesso de zelo: estas rotas rodam na conexão com BYPASSRLS e enxergam
 * todos os assinantes de uma vez. Reaproveitar o token do painel colocaria a
 * fronteira entre "ver a própria empresa" e "ver todas" numa comparação de
 * string — e uma comparação esquecida vira vazamento entre clientes.
 *
 * O token de plataforma não tem `tid`, então `verifyAccessToken` o rejeita;
 * o token do painel tem `scope: 'tenant'`, então `verifyPlatformToken` o
 * rejeita. Nenhum dos dois passa pelo lado errado.
 */
export const requirePlatformAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    let claims;
    try {
      claims = await verifyPlatformToken(header.slice('Bearer '.length));
    } catch {
      throw unauthorized('Sessão inválida ou expirada.');
    }

    req.platform = { userId: claims.sub, role: claims.role };

    const context = requireContext();
    context.userId = claims.sub;
    context.role = claims.role;
    context.scope = 'platform';

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * `support` lê; `owner` escreve.
 *
 * Quem atende o suporte precisa consultar a conta do cliente para responder
 * uma dúvida — não precisa poder suspender a loja dele nem mudar o preço do
 * plano. São as duas ações que não têm desfazer.
 */
export function requirePlatformRole(...roles: PlatformRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.platform) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.platform.role)) {
      next(forbidden('Esta ação exige um administrador da plataforma.'));
      return;
    }
    next();
  };
}

export const requirePlatformOwner = requirePlatformRole('owner');
