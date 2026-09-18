import {
  changeTenantStatusRequestSchema,
  createPlanRequestSchema,
  createTenantRequestSchema,
  listSubscriptionsQuerySchema,
  listTenantsQuerySchema,
  platformLoginRequestSchema,
  updatePlanRequestSchema,
  updateTenantRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requirePlatformOwner } from '../../http/middlewares/platform-auth';
import { authLimiter } from '../../http/middlewares/rate-limit';
import { platformRoute } from '../../http/route';
import * as service from './platform.service';

/**
 * Administração da plataforma (§6.11 do PLAN.md, D5).
 *
 * `requirePlatformAuth` é aplicado no MOUNT, em `router.ts` — menos o login,
 * que é montado antes por motivos óbvios. Dentro, `requirePlatformOwner`
 * protege as escritas: `support` consulta a conta do cliente para responder
 * uma dúvida, mas não suspende a loja dele nem mexe no preço do plano.
 */

const idParam = z.object({ id: uuidSchema });

/** Login. Público — e com o mesmo limitador do login do painel. */
export const platformAuthRouter: Router = Router();

platformAuthRouter.post(
  '/login',
  authLimiter,
  platformRoute({
    body: platformLoginRequestSchema,
    anonymous: true,
    handler: ({ tx, body }) => service.login(tx, body),
  }),
);

export const platformAdminRouter: Router = Router();

/* --- Sessão --- */

platformAdminRouter.get(
  '/me',
  platformRoute({
    handler: async ({ req }) => ({
      id: req.platform!.userId,
      role: req.platform!.role,
    }),
  }),
);

/* --- Métricas --- */

platformAdminRouter.get(
  '/metrics',
  platformRoute({ handler: ({ tx }) => service.metrics(tx) }),
);

/* --- Planos --- */

platformAdminRouter.get(
  '/plans',
  platformRoute({ handler: ({ tx }) => service.listPlans(tx) }),
);

platformAdminRouter.post(
  '/plans',
  requirePlatformOwner,
  platformRoute({
    body: createPlanRequestSchema,
    status: 201,
    handler: ({ tx, body }) => service.createPlan(tx, body),
  }),
);

platformAdminRouter.patch(
  '/plans/:id',
  requirePlatformOwner,
  platformRoute({
    params: idParam,
    body: updatePlanRequestSchema,
    handler: ({ tx, params, body }) => service.updatePlan(tx, params.id, body),
  }),
);

/* --- Empresas --- */

platformAdminRouter.get(
  '/tenants',
  platformRoute({
    query: listTenantsQuerySchema,
    handler: ({ tx, query }) => service.listTenants(tx, query),
  }),
);

platformAdminRouter.post(
  '/tenants',
  requirePlatformOwner,
  platformRoute({
    body: createTenantRequestSchema,
    status: 201,
    handler: ({ tx, body }) => service.createTenant(tx, body),
  }),
);

platformAdminRouter.get(
  '/tenants/:id',
  platformRoute({
    params: idParam,
    handler: ({ tx, params }) => service.getTenant(tx, params.id),
  }),
);

platformAdminRouter.patch(
  '/tenants/:id',
  requirePlatformOwner,
  platformRoute({
    params: idParam,
    body: updateTenantRequestSchema,
    handler: ({ tx, params, body }) => service.updateTenant(tx, params.id, body),
  }),
);

// Uma rota só para os dois sentidos: suspender e reativar são a mesma
// decisão, e separá-las em `/suspend` e `/activate` duplicaria a exigência
// de motivo — que é a parte que não pode faltar em nenhum dos dois.
platformAdminRouter.post(
  '/tenants/:id/status',
  requirePlatformOwner,
  platformRoute({
    params: idParam,
    body: changeTenantStatusRequestSchema,
    handler: ({ tx, params, body, req }) =>
      service.changeStatus(tx, params.id, body, req.platform!.userId),
  }),
);

/* --- Assinaturas --- */

platformAdminRouter.get(
  '/subscriptions',
  platformRoute({
    query: listSubscriptionsQuerySchema,
    handler: ({ tx, query }) => service.listSubscriptions(tx, query),
  }),
);
