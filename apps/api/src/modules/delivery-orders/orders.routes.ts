import {
  cancelOrderRequestSchema,
  changeStatusRequestSchema,
  createDeliveryOrderRequestSchema,
  listDeliveryOrdersQuerySchema,
  registerPaymentRequestSchema,
  updateDeliveryOrderRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireManager } from '../../http/middlewares/auth';
import { getIdempotencyKey } from '../../http/middlewares/idempotency';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as service from './orders.service';

/**
 * Kanban de delivery (§6.7 do PLAN.md).
 *
 * Tudo aberto a `staff`: este é o trabalho do dia. A exceção é editar valores
 * do pedido — desconto e taxa mexem em dinheiro e exigem `manager`.
 */

const idParam = z.object({ id: uuidSchema });

export const deliveryOrdersRouter: Router = Router();

/** Antes de `/:id`, senão "board" seria lido como um id. */
deliveryOrdersRouter.get(
  '/board',
  tenantRoute({ handler: ({ tx }) => service.board(tx) }),
);

deliveryOrdersRouter.get(
  '/',
  tenantRoute({
    query: listDeliveryOrdersQuerySchema,
    handler: ({ tx, query }) => service.list(tx, query),
  }),
);

deliveryOrdersRouter.post(
  '/',
  requireActiveTenant,
  tenantRoute({
    body: createDeliveryOrderRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body, req }) =>
      // A chave é opcional no painel (o lojista está digitando, não há
      // reenvio automático) e obrigatória na vitrine, onde a rede cai.
      service.create(tx, tenantId, body, { idempotencyKey: getIdempotencyKey(req) }),
  }),
);

deliveryOrdersRouter.get(
  '/:id',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => service.get(tx, params.id),
  }),
);

deliveryOrdersRouter.patch(
  '/:id',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: updateDeliveryOrderRequestSchema,
    handler: ({ tx, tenantId, params, body }) => service.update(tx, tenantId, params.id, body),
  }),
);

/**
 * Única porta de transição (invariante 5).
 *
 * Não existe `PATCH /:id` que mude status: estoque e financeiro penduram
 * efeitos aqui, e um segundo caminho os contornaria.
 */
deliveryOrdersRouter.patch(
  '/:id/status',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: changeStatusRequestSchema,
    handler: ({ tx, tenantId, params, body, user }) =>
      service.transition(tx, tenantId, params.id, body.status, user?.id),
  }),
);

deliveryOrdersRouter.post(
  '/:id/cancel',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: cancelOrderRequestSchema,
    handler: ({ tx, tenantId, params, body, user }) =>
      service.cancel(tx, tenantId, params.id, body.reason, user?.id),
  }),
);

deliveryOrdersRouter.post(
  '/:id/payment',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: registerPaymentRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.registerPayment(tx, tenantId, params.id, body),
  }),
);
