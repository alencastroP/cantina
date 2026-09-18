import {
  cashflowQuerySchema,
  createAccountRequestSchema,
  createEntryRequestSchema,
  createFinanceCategoryRequestSchema,
  createRecurrenceRequestSchema,
  listEntriesQuerySchema,
  settleEntryRequestSchema,
  updateEntryRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireRole } from '../../http/middlewares/auth';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as service from './finance.service';

/**
 * Financeiro (§6.9 do PLAN.md).
 *
 * Papel `finance` existe justamente para isto: o contador tem acesso aos
 * lançamentos e ao fluxo de caixa sem ver o kanban nem mexer no cardápio.
 * `staff` não entra — quem está no balcão não precisa ver o resultado do mês.
 */
const financeAccess = requireRole('owner', 'manager', 'finance');
const idParam = z.object({ id: uuidSchema });

export const financeRouter: Router = Router();

financeRouter.use(financeAccess);

/* --- Lançamentos --- */

financeRouter.get(
  '/entries',
  tenantRoute({
    query: listEntriesQuerySchema,
    handler: ({ tx, query }) => service.listEntries(tx, query),
  }),
);

financeRouter.post(
  '/entries',
  requireActiveTenant,
  tenantRoute({
    body: createEntryRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => service.createEntry(tx, tenantId, body),
  }),
);

financeRouter.patch(
  '/entries/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: updateEntryRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.updateEntry(tx, tenantId, params.id, body),
  }),
);

financeRouter.post(
  '/entries/:id/settle',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: settleEntryRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.settleEntry(tx, tenantId, params.id, body),
  }),
);

financeRouter.delete(
  '/entries/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => service.removeEntry(tx, tenantId, params.id),
  }),
);

/* --- Contas e categorias --- */

financeRouter.get(
  '/accounts',
  tenantRoute({ handler: ({ tx }) => service.listAccounts(tx) }),
);

financeRouter.post(
  '/accounts',
  requireActiveTenant,
  tenantRoute({
    body: createAccountRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => service.createAccount(tx, tenantId, body),
  }),
);

financeRouter.get(
  '/categories',
  tenantRoute({ handler: ({ tx }) => service.listCategories(tx) }),
);

financeRouter.post(
  '/categories',
  requireActiveTenant,
  tenantRoute({
    body: createFinanceCategoryRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => service.createCategory(tx, tenantId, body),
  }),
);

/* --- Recorrências --- */

financeRouter.get(
  '/recurrences',
  tenantRoute({ handler: ({ tx }) => service.listRecurrences(tx) }),
);

financeRouter.post(
  '/recurrences',
  requireActiveTenant,
  tenantRoute({
    body: createRecurrenceRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => service.createRecurrence(tx, tenantId, body),
  }),
);

financeRouter.delete(
  '/recurrences/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => service.removeRecurrence(tx, tenantId, params.id),
  }),
);

/* --- Fluxo de caixa --- */

financeRouter.get(
  '/cashflow',
  tenantRoute({
    query: cashflowQuerySchema,
    handler: ({ tx, query }) => service.cashflow(tx, query.from, query.to),
  }),
);
