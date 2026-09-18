import {
  costSummaryQuerySchema,
  createProductionRequestSchema,
  createSalesChannelRequestSchema,
  listSalesChannelsQuerySchema,
  putRecipeRequestSchema,
  simulateRequestSchema,
  updateSalesChannelRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireManager } from '../../http/middlewares/auth';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as channelsService from './channels.service';
import * as pricingService from './pricing.service';
import * as productionService from './production.service';
import * as recipesService from './recipes.service';

/**
 * Fichas técnicas, canais e precificação (§6.6 do PLAN.md).
 *
 * Custo e margem são informação de gestão: leitura exige `manager`. Um
 * atendente não precisa saber a margem de cada produto para tocar o balcão,
 * e o dado circula menos quanto menos gente o vê.
 *
 * Produção é operação de cozinha e fica aberta a `staff`.
 */

const idParam = z.object({ id: uuidSchema });
const manage = [requireManager, requireActiveTenant] as const;

/* -------------------------------------------------------------------------- */
/* /variants/:id/recipe e /cost                                                */
/* -------------------------------------------------------------------------- */

export const variantRecipesRouter: Router = Router();

variantRecipesRouter.get(
  '/:id/recipe',
  requireManager,
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => recipesService.getRecipe(tx, params.id),
  }),
);

variantRecipesRouter.put(
  '/:id/recipe',
  ...manage,
  tenantRoute({
    params: idParam,
    body: putRecipeRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      recipesService.putRecipe(tx, tenantId, params.id, body),
  }),
);

variantRecipesRouter.delete(
  '/:id/recipe',
  ...manage,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => recipesService.removeRecipe(tx, tenantId, params.id),
  }),
);

variantRecipesRouter.get(
  '/:id/cost',
  requireManager,
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => recipesService.getCost(tx, params.id),
  }),
);

/** Quantas unidades dá para vender agora — `tracked` ou derivado da receita. */
variantRecipesRouter.get(
  '/:id/availability',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => recipesService.availabilityForVariant(tx, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /products/:id/costing                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Ficha técnica e custo do produto inteiro.
 *
 * Mesmo desenho do `/variants`: segundo router sobre `/products`, montado
 * DEPOIS do catálogo. `/:id/costing` não casa com nenhuma rota do módulo 2,
 * então a requisição atravessa o primeiro router e chega aqui.
 */
export const productCostingRouter: Router = Router();

productCostingRouter.get(
  '/:id/costing',
  requireManager,
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => recipesService.getProductCosting(tx, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /sales-channels                                                             */
/* -------------------------------------------------------------------------- */

export const salesChannelsRouter: Router = Router();

salesChannelsRouter.get(
  '/',
  tenantRoute({
    query: listSalesChannelsQuerySchema,
    handler: ({ tx, query }) => channelsService.list(tx, query),
  }),
);

salesChannelsRouter.post(
  '/',
  ...manage,
  tenantRoute({
    body: createSalesChannelRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => channelsService.create(tx, tenantId, body),
  }),
);

salesChannelsRouter.patch(
  '/:id',
  ...manage,
  tenantRoute({
    params: idParam,
    body: updateSalesChannelRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      channelsService.update(tx, tenantId, params.id, body),
  }),
);

salesChannelsRouter.delete(
  '/:id',
  ...manage,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => channelsService.remove(tx, tenantId, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /pricing                                                                    */
/* -------------------------------------------------------------------------- */

export const pricingRouter: Router = Router();

pricingRouter.post(
  '/simulate',
  requireManager,
  tenantRoute({
    body: simulateRequestSchema,
    handler: ({ tx, body }) => pricingService.simulate(tx, body),
  }),
);

/** Tem ficha? Quanto custa? Quanto sobra? — de várias variações de uma vez. */
pricingRouter.get(
  '/summary',
  requireManager,
  tenantRoute({
    query: costSummaryQuerySchema,
    handler: ({ tx, query }) => recipesService.costSummary(tx, query.variantIds),
  }),
);

/* -------------------------------------------------------------------------- */
/* /stock/production (D19)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Montado sob `/stock` junto com o router do módulo 3, porque é ali que a
 * operação vive do ponto de vista de quem usa. O código fica aqui porque
 * produzir explode a receita, e `recipe_items` tem um dono só.
 */
export const productionRouter: Router = Router();

productionRouter.post(
  '/production',
  requireActiveTenant,
  tenantRoute({
    body: createProductionRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => productionService.produce(tx, tenantId, body),
  }),
);
