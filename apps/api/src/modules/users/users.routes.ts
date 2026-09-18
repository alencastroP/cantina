import {
  acceptInviteRequestSchema,
  inviteUserRequestSchema,
  listUsersQuerySchema,
  updateUserRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { unauthorized } from '../../http/errors/app-error';
import { requireOwner } from '../../http/middlewares/auth';
import { enforcePlanLimit } from '../../http/middlewares/plan-limits';
import { authLimiter } from '../../http/middlewares/rate-limit';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { openRoute, tenantRoute } from '../../http/route';
import { setRefreshCookie } from '../auth/auth.cookies';
import * as service from './users.service';

/**
 * Usuários e convites (§6.2 do PLAN.md).
 *
 * Gestão de usuários é exclusiva do `owner` (D3): `manager` toca a operação,
 * mas não decide quem entra na empresa.
 *
 * `requireActiveTenant` nas escritas — assinatura em atraso deixa o painel
 * em somente-leitura (§4.1).
 */

const idParamSchema = z.object({ id: uuidSchema });

export const usersRouter: Router = Router();

usersRouter.get(
  '/',
  tenantRoute({
    query: listUsersQuerySchema,
    handler: ({ tx, query }) => service.list(tx, query),
  }),
);

usersRouter.get(
  '/invites',
  requireOwner,
  tenantRoute({
    handler: ({ tx }) => service.listInvites(tx),
  }),
);

usersRouter.post(
  '/invites',
  requireOwner,
  requireActiveTenant,
  // O convite conta contra o limite no momento em que é enviado, e não no
  // aceite: senão o lojista convidaria dez pessoas e descobriria o limite
  // quando a décima tentasse entrar.
  enforcePlanLimit('users'),
  tenantRoute({
    body: inviteUserRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body, user, req }) => {
      if (!user || !req.tenant) throw unauthorized();
      return service.invite(tx, tenantId, req.tenant.name, req.tenant.slug, body, user.id);
    },
  }),
);

usersRouter.delete(
  '/invites/:id',
  requireOwner,
  requireActiveTenant,
  tenantRoute({
    params: idParamSchema,
    status: 204,
    handler: ({ tx, tenantId, params }) => service.revokeInvite(tx, tenantId, params.id),
  }),
);

usersRouter.patch(
  '/:id',
  requireOwner,
  requireActiveTenant,
  tenantRoute({
    params: idParamSchema,
    body: updateUserRequestSchema,
    handler: ({ tx, tenantId, params, body, user }) => {
      if (!user) throw unauthorized();
      return service.update(tx, tenantId, user.id, params.id, body);
    },
  }),
);

usersRouter.delete(
  '/:id',
  requireOwner,
  requireActiveTenant,
  tenantRoute({
    params: idParamSchema,
    status: 204,
    handler: ({ tx, tenantId, params, user }) => {
      if (!user) throw unauthorized();
      return service.remove(tx, tenantId, user.id, params.id);
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Aceite de convite — público, montado fora do router autenticado            */
/* -------------------------------------------------------------------------- */

const inviteLookupSchema = z.object({
  tenant: z.string().trim().toLowerCase(),
  token: z.string().min(16),
});

export const invitesPublicRouter: Router = Router();

/** A tela de aceite mostra e-mail, papel e empresa antes de pedir a senha. */
invitesPublicRouter.get(
  '/',
  authLimiter,
  openRoute({
    query: inviteLookupSchema,
    handler: ({ query }) =>
      service.inviteDetails({ tenantSlug: query.tenant, token: query.token }),
  }),
);

invitesPublicRouter.post(
  '/accept',
  authLimiter,
  openRoute({
    body: acceptInviteRequestSchema,
    handler: async ({ body, req, res }) => {
      const session = await service.acceptInvite(body, {
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
      });
      setRefreshCookie(res, session.refresh.tenantId, session.refresh.token);
      const { refresh: _refresh, ...response } = session;
      return response;
    },
  }),
);
