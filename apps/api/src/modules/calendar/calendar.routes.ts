import {
  calendarFeedQuerySchema,
  createReminderRequestSchema,
  updateReminderRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { unauthorized } from '../../http/errors/app-error';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as service from './calendar.service';

/**
 * Calendário da loja.
 *
 * Aberto à equipe toda: lembrete é trabalho do dia, e quem está no balcão é
 * quem mais precisa lembrar de separar a encomenda de amanhã. O que o papel
 * NÃO pode ver (as contas) o serviço corta — não é esta camada que decide.
 *
 * `requireActiveTenant` nas escritas, como no resto do painel.
 */

const idParam = z.object({ id: uuidSchema });

export const calendarRouter: Router = Router();

calendarRouter.get(
  '/',
  tenantRoute({
    query: calendarFeedQuerySchema,
    handler: ({ tx, tenantId, query, user, req }) => {
      if (!user || !req.tenant) throw unauthorized();
      return service.feed(tx, tenantId, query, user, req.tenant.timeZone);
    },
  }),
);

calendarRouter.post(
  '/reminders',
  requireActiveTenant,
  tenantRoute({
    body: createReminderRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body, user }) => {
      if (!user) throw unauthorized();
      return service.createReminder(tx, tenantId, body, user);
    },
  }),
);

calendarRouter.patch(
  '/reminders/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: updateReminderRequestSchema,
    handler: ({ tx, tenantId, params, body, user }) => {
      if (!user) throw unauthorized();
      return service.updateReminder(tx, tenantId, params.id, body, user);
    },
  }),
);

calendarRouter.delete(
  '/reminders/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params, user }) => {
      if (!user) throw unauthorized();
      return service.removeReminder(tx, tenantId, params.id, user);
    },
  }),
);
