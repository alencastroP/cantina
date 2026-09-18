import {
  addProductImageRequestSchema,
  createCategoryRequestSchema,
  createProductRequestSchema,
  createVariantRequestSchema,
  listProductsQuerySchema,
  reorderRequestSchema,
  updateAvailabilityRequestSchema,
  updateCategoryRequestSchema,
  updateProductRequestSchema,
  updateVariantRequestSchema,
  uploadUrlRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireManager } from '../../http/middlewares/auth';
import { enforcePlanLimit } from '../../http/middlewares/plan-limits';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as categoriesService from './categories.service';
import * as imagesService from './images.service';
import * as productsService from './products.service';
import * as variantsService from './variants.service';

/**
 * Catálogo (§6.4 do PLAN.md).
 *
 * Leitura para qualquer usuário logado — o balcão precisa consultar preço.
 * Escrita para `owner` e `manager`: `staff` toca kanban e estoque, não
 * cadastro.
 */

const idParam = z.object({ id: uuidSchema });
const write = [requireManager, requireActiveTenant] as const;

/* -------------------------------------------------------------------------- */
/* /categories                                                                 */
/* -------------------------------------------------------------------------- */

export const categoriesRouter: Router = Router();

categoriesRouter.get(
  '/',
  tenantRoute({ handler: ({ tx }) => categoriesService.list(tx) }),
);

categoriesRouter.post(
  '/',
  ...write,
  tenantRoute({
    body: createCategoryRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => categoriesService.create(tx, tenantId, body),
  }),
);

// Antes de `/:id` — sem isso, "reorder" seria lido como um id e falharia na
// validação de UUID em vez de chegar nesta rota.
categoriesRouter.patch(
  '/reorder',
  ...write,
  tenantRoute({
    body: reorderRequestSchema,
    handler: ({ tx, tenantId, body }) => categoriesService.reorder(tx, tenantId, body.ids),
  }),
);

categoriesRouter.patch(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    body: updateCategoryRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      categoriesService.update(tx, tenantId, params.id, body),
  }),
);

categoriesRouter.delete(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    handler: ({ tx, tenantId, params }) => categoriesService.remove(tx, tenantId, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /products                                                                   */
/* -------------------------------------------------------------------------- */

export const productsRouter: Router = Router();

productsRouter.get(
  '/',
  tenantRoute({
    query: listProductsQuerySchema,
    handler: ({ tx, query }) => productsService.list(tx, query),
  }),
);

productsRouter.post(
  '/',
  ...write,
  // Só na criação: quem baixou de plano continua editando o que já tem.
  enforcePlanLimit('products'),
  tenantRoute({
    body: createProductRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => productsService.create(tx, tenantId, body),
  }),
);

productsRouter.patch(
  '/reorder',
  ...write,
  tenantRoute({
    body: reorderRequestSchema,
    status: 204,
    handler: ({ tx, tenantId, body }) => productsService.reorder(tx, tenantId, body.ids),
  }),
);

productsRouter.get(
  '/:id',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => productsService.get(tx, params.id),
  }),
);

productsRouter.patch(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    body: updateProductRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      productsService.update(tx, tenantId, params.id, body),
  }),
);

/** Pausar/despausar na vitrine — operação, não cadastro. */
productsRouter.patch(
  '/:id/availability',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: updateAvailabilityRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      productsService.updateAvailability(tx, tenantId, params.id, body),
  }),
);

productsRouter.delete(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => productsService.remove(tx, tenantId, params.id),
  }),
);

/* --- Variações de um produto --- */

productsRouter.get(
  '/:id/variants',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => variantsService.listForProduct(tx, params.id),
  }),
);

productsRouter.post(
  '/:id/variants',
  ...write,
  tenantRoute({
    params: idParam,
    body: createVariantRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, params, body }) =>
      variantsService.create(tx, tenantId, params.id, body),
  }),
);

/* --- Imagens --- */

productsRouter.post(
  '/:id/images/upload-url',
  ...write,
  tenantRoute({
    params: idParam,
    body: uploadUrlRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      imagesService.createUploadUrl(tx, tenantId, params.id, body),
  }),
);

productsRouter.post(
  '/:id/images',
  ...write,
  tenantRoute({
    params: idParam,
    body: addProductImageRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, params, body }) =>
      imagesService.addImage(tx, tenantId, params.id, body),
  }),
);

productsRouter.patch(
  '/:id/images/reorder',
  ...write,
  tenantRoute({
    params: idParam,
    body: reorderRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      imagesService.reorderImages(tx, tenantId, params.id, body.ids),
  }),
);

/* -------------------------------------------------------------------------- */
/* /variants                                                                   */
/* -------------------------------------------------------------------------- */

export const variantsRouter: Router = Router();

variantsRouter.patch(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    body: updateVariantRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      variantsService.update(tx, tenantId, params.id, body),
  }),
);

variantsRouter.delete(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => variantsService.remove(tx, tenantId, params.id),
  }),
);

/* -------------------------------------------------------------------------- */
/* /product-images                                                             */
/* -------------------------------------------------------------------------- */

export const productImagesRouter: Router = Router();

productImagesRouter.delete(
  '/:id',
  ...write,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => imagesService.removeImage(tx, tenantId, params.id),
  }),
);
