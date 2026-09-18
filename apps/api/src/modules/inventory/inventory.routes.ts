import {
  createAdjustmentRequestSchema,
  createLossRequestSchema,
  createPurchaseRequestSchema,
  createSupplierRequestSchema,
  createSupplyRequestSchema,
  cursorQuerySchema,
  listMovementsQuerySchema,
  listPurchasesQuerySchema,
  listStockQuerySchema,
  listSuppliesQuerySchema,
  updateSupplierRequestSchema,
  updateSupplyRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireManager } from '../../http/middlewares/auth';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as purchasesService from './purchases.service';
import * as stockService from './stock.service';
import * as suppliesService from './supplies.service';

/**
 * Estoque, insumos e compras (§6.5 do PLAN.md).
 *
 * Ajuste, perda e consulta de saldo ficam abertos a `staff`: são operação de
 * cozinha, feitas por quem está com a mão na massa. Cadastro de insumo,
 * fornecedor e registro de compra exigem `manager` — envolvem dinheiro e
 * mudam o custo de todo o cardápio.
 */

const idParam = z.object({ id: uuidSchema });
const manage = [requireManager, requireActiveTenant] as const;

/* -------------------------------------------------------------------------- */
/* /stock                                                                      */
/* -------------------------------------------------------------------------- */

export const stockRouter: Router = Router();

stockRouter.get(
  '/',
  tenantRoute({
    query: listStockQuerySchema,
    handler: ({ tx, query }) => stockService.listBalances(tx, query),
  }),
);

stockRouter.get(
  '/movements',
  tenantRoute({
    query: listMovementsQuerySchema,
    handler: ({ tx, query }) => stockService.listMovements(tx, query),
  }),
);

stockRouter.post(
  '/adjustments',
  requireActiveTenant,
  tenantRoute({
    body: createAdjustmentRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => stockService.adjust(tx, tenantId, body),
  }),
);

stockRouter.post(
  '/losses',
  requireActiveTenant,
  tenantRoute({
    body: createLossRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => stockService.registerLoss(tx, tenantId, body),
  }),
);

// `POST /stock/production` (D19) entra no módulo 4: produzir explode a ficha
// técnica, e as receitas ainda não têm dono. Registrar aqui uma rota que lê
// `recipe_items` deixaria a tabela com dois donos.

/* -------------------------------------------------------------------------- */
/* /supplies                                                                   */
/* -------------------------------------------------------------------------- */

export const suppliesRouter: Router = Router();

suppliesRouter.get(
  '/',
  tenantRoute({
    query: listSuppliesQuerySchema,
    handler: ({ tx, query }) => suppliesService.list(tx, query),
  }),
);

// Antes de `/:id`, senão "low-stock" seria lido como um id.
suppliesRouter.get(
  '/low-stock',
  tenantRoute({ handler: ({ tx }) => suppliesService.lowStock(tx) }),
);

suppliesRouter.post(
  '/',
  ...manage,
  tenantRoute({
    body: createSupplyRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => suppliesService.create(tx, tenantId, body),
  }),
);

suppliesRouter.get(
  '/:id',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => suppliesService.get(tx, params.id),
  }),
);

suppliesRouter.patch(
  '/:id',
  ...manage,
  tenantRoute({
    params: idParam,
    body: updateSupplyRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      suppliesService.update(tx, tenantId, params.id, body),
  }),
);

suppliesRouter.delete(
  '/:id',
  ...manage,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => suppliesService.remove(tx, tenantId, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /suppliers                                                                  */
/* -------------------------------------------------------------------------- */

const listSuppliersQuerySchema = cursorQuerySchema.extend({
  active: z.coerce.boolean().optional(),
});

export const suppliersRouter: Router = Router();

suppliersRouter.get(
  '/',
  tenantRoute({
    query: listSuppliersQuerySchema,
    handler: ({ tx, query }) => suppliesService.listSuppliers(tx, query),
  }),
);

suppliersRouter.post(
  '/',
  ...manage,
  tenantRoute({
    body: createSupplierRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => suppliesService.createSupplier(tx, tenantId, body),
  }),
);

suppliersRouter.patch(
  '/:id',
  ...manage,
  tenantRoute({
    params: idParam,
    body: updateSupplierRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      suppliesService.updateSupplier(tx, tenantId, params.id, body),
  }),
);

suppliersRouter.delete(
  '/:id',
  ...manage,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) =>
      suppliesService.removeSupplier(tx, tenantId, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /supply-purchases                                                           */
/* -------------------------------------------------------------------------- */

export const purchasesRouter: Router = Router();

purchasesRouter.get(
  '/',
  tenantRoute({
    query: listPurchasesQuerySchema,
    handler: ({ tx, query }) => purchasesService.list(tx, query),
  }),
);

purchasesRouter.post(
  '/',
  ...manage,
  tenantRoute({
    body: createPurchaseRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => purchasesService.create(tx, tenantId, body),
  }),
);
