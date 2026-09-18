import {
  replaceBusinessHoursRequestSchema,
  updateStatusLabelsRequestSchema,
  updateTenantSettingsRequestSchema,
} from '@cantina/contracts';
import { Router } from 'express';

import { requireManager } from '../../http/middlewares/auth';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as service from './settings.service';

/**
 * Configurações da empresa (§6.10 do PLAN.md).
 *
 * Leitura para qualquer usuário logado — a operação do dia precisa saber o
 * horário e os rótulos das colunas. Escrita para `owner` e `manager`.
 */

export const settingsRouter: Router = Router();

settingsRouter.get(
  '/',
  tenantRoute({
    handler: ({ tx, tenantId }) => service.get(tx, tenantId),
  }),
);

settingsRouter.put(
  '/',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    body: updateTenantSettingsRequestSchema,
    handler: ({ tx, tenantId, body }) => service.update(tx, tenantId, body),
  }),
);

settingsRouter.get(
  '/business-hours',
  tenantRoute({
    handler: ({ tx }) => service.getBusinessHours(tx),
  }),
);

settingsRouter.put(
  '/business-hours',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    body: replaceBusinessHoursRequestSchema,
    handler: ({ tx, tenantId, body }) => service.replaceBusinessHours(tx, tenantId, body.hours),
  }),
);

settingsRouter.get(
  '/status-labels',
  tenantRoute({
    handler: ({ tx }) => service.getStatusLabels(tx),
  }),
);

settingsRouter.put(
  '/status-labels',
  requireManager,
  requireActiveTenant,
  tenantRoute({
    body: updateStatusLabelsRequestSchema,
    handler: ({ tx, tenantId, body }) => service.updateStatusLabels(tx, tenantId, body),
  }),
);
