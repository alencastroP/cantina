import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
} from '@cantina/contracts';
import { Router } from 'express';

import { unauthorized } from '../../http/errors/app-error';
import { requireAuth } from '../../http/middlewares/auth';
import { authLimiter } from '../../http/middlewares/rate-limit';
import { openRoute, tenantRoute } from '../../http/route';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './auth.cookies';
import * as service from './auth.service';

/**
 * Rotas de autenticação (§6.2 do PLAN.md).
 *
 * Montadas SEM `requireAuth` no router — login e refresh são justamente o
 * que acontece antes de haver sessão. Só `/me` exige token, aplicado por
 * rota.
 */

export const authRouter: Router = Router();

function meta(req: { header(name: string): string | undefined; ip?: string | undefined }) {
  return { userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null };
}

authRouter.post(
  '/login',
  authLimiter,
  openRoute({
    body: loginRequestSchema,
    handler: async ({ body, req, res }) => {
      const session = await service.login(body, meta(req));
      setRefreshCookie(res, session.refresh.tenantId, session.refresh.token);

      // O refresh token nunca vai no corpo: se fosse, JavaScript da página
      // conseguiria lê-lo, e o cookie httpOnly perderia o propósito.
      const { refresh: _refresh, ...response } = session;
      return response;
    },
  }),
);

authRouter.post(
  '/refresh',
  openRoute({
    handler: async ({ req, res }) => {
      const cookie = readRefreshCookie(req);
      if (!cookie) throw unauthorized('Sessão inválida.');

      try {
        const session = await service.refresh(cookie, meta(req));
        setRefreshCookie(res, session.refresh.tenantId, session.refresh.token);
        const { refresh: _refresh, ...response } = session;
        return response;
      } catch (error) {
        // Sessão irrecuperável: limpa o cookie para o cliente parar de
        // insistir com um token que nunca mais vai valer.
        clearRefreshCookie(res);
        throw error;
      }
    },
  }),
);

authRouter.post(
  '/logout',
  openRoute({
    status: 204,
    handler: async ({ req, res }) => {
      await service.logout(readRefreshCookie(req));
      clearRefreshCookie(res);
    },
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  tenantRoute({
    handler: async ({ tx, user, req }) => {
      if (!user || !req.tenant) throw unauthorized();
      return service.me(tx, user.id, req.tenant);
    },
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  openRoute({
    body: forgotPasswordRequestSchema,
    status: 204,
    handler: async ({ body }) => {
      await service.forgotPassword(body);
      // Sempre 204, exista o e-mail ou não.
    },
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  openRoute({
    body: resetPasswordRequestSchema,
    status: 204,
    handler: async ({ body, res }) => {
      await service.resetPassword(body);
      clearRefreshCookie(res);
    },
  }),
);
