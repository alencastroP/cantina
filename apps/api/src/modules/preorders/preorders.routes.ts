import {
  availabilityRangeQuerySchema,
  calendarQuerySchema,
  cancelOrderRequestSchema,
  changePreorderStatusRequestSchema,
  createExceptionRequestSchema,
  createPreorderRequestSchema,
  listPreordersQuerySchema,
  putAvailabilityRulesRequestSchema,
  registerDepositRequestSchema,
  updatePreorderRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { internal } from '../../http/errors/app-error';
import { requireManager } from '../../http/middlewares/auth';
import { getIdempotencyKey } from '../../http/middlewares/idempotency';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as availabilityService from './availability.service';
import * as service from './preorders.service';

/**
 * Encomendas e agenda (§6.8 do PLAN.md).
 *
 * Operar encomenda é trabalho do dia, aberto a `staff`. Configurar a AGENDA
 * é decisão de capacidade da cozinha — quantas encomendas cabem num sábado —
 * e exige `manager`.
 */

const idParam = z.object({ id: uuidSchema });

export const preordersRouter: Router = Router();

preordersRouter.get(
  '/board',
  tenantRoute({ handler: ({ tx }) => service.board(tx) }),
);

preordersRouter.get(
  '/calendar',
  tenantRoute({
    query: calendarQuerySchema,
    handler: ({ tx, query }) => service.calendar(tx, query.month),
  }),
);

preordersRouter.get(
  '/',
  tenantRoute({
    query: listPreordersQuerySchema,
    handler: ({ tx, query }) => service.list(tx, query),
  }),
);

preordersRouter.post(
  '/',
  requireActiveTenant,
  tenantRoute({
    body: createPreorderRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body, req }) => {
      if (!req.tenant) throw internal('Rota de encomenda sem tenant resolvido.');
      return service.create(tx, tenantId, body, {
        idempotencyKey: getIdempotencyKey(req),
        timeZone: req.tenant.timeZone,
      });
    },
  }),
);

preordersRouter.get(
  '/:id',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => service.get(tx, params.id),
  }),
);

preordersRouter.patch(
  '/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: updatePreorderRequestSchema,
    handler: ({ tx, tenantId, params, body, req }) => {
      if (!req.tenant) throw internal('Rota de encomenda sem tenant resolvido.');
      return service.update(tx, tenantId, params.id, body, req.tenant.timeZone);
    },
  }),
);

preordersRouter.patch(
  '/:id/status',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: changePreorderStatusRequestSchema,
    handler: ({ tx, tenantId, params, body, user }) =>
      service.transition(tx, tenantId, params.id, body.status, user?.id),
  }),
);

preordersRouter.post(
  '/:id/cancel',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: cancelOrderRequestSchema,
    handler: ({ tx, tenantId, params, body, user }) =>
      service.cancel(tx, tenantId, params.id, body.reason, user?.id),
  }),
);

preordersRouter.post(
  '/:id/deposit',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: registerDepositRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.registerDeposit(tx, tenantId, params.id, body),
  }),
);

/* -------------------------------------------------------------------------- */
/* /availability                                                               */
/* -------------------------------------------------------------------------- */

export const availabilityRouter: Router = Router();

availabilityRouter.get(
  '/rules',
  tenantRoute({ handler: ({ tx }) => availabilityService.getRules(tx) }),
);

availabilityRouter.put(
  '/rules',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    body: putAvailabilityRulesRequestSchema,
    handler: ({ tx, tenantId, body }) =>
      availabilityService.putRules(tx, tenantId, body.rules),
  }),
);

availabilityRouter.get(
  '/exceptions',
  tenantRoute({
    query: availabilityRangeQuerySchema.partial(),
    handler: ({ tx, query }) => availabilityService.listExceptions(tx, query.from, query.to),
  }),
);

availabilityRouter.post(
  '/exceptions',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    body: createExceptionRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => availabilityService.upsertException(tx, tenantId, body),
  }),
);

availabilityRouter.delete(
  '/exceptions/:id',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) =>
      availabilityService.removeException(tx, tenantId, params.id),
  }),
);

/** Visão do lojista: capacidade, usado e reservado por dia. */
availabilityRouter.get(
  '/days',
  tenantRoute({
    query: availabilityRangeQuerySchema,
    handler: ({ tx, tenantId, query, req }) => {
      if (!req.tenant) throw internal('Rota de agenda sem tenant resolvido.');
      return availabilityService.getRange(
        tx,
        tenantId,
        query.from,
        query.to,
        req.tenant.timeZone,
      );
    },
  }),
);
