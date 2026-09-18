import {
  createStorefrontOrderRequestSchema,
  createStorefrontPreorderRequestSchema,
  storefrontAvailabilityQuerySchema,
  deliveryQuoteRequestSchema,
  menuQuerySchema,
  productSlugParamSchema,
  trackOrderQuerySchema,
  whatsappDraftRequestSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { internal } from '../../http/errors/app-error';
import { getIdempotencyKey, requireIdempotencyKey } from '../../http/middlewares/idempotency';
import { writeLimiter } from '../../http/middlewares/rate-limit';
import { tenantRoute } from '../../http/route';
import * as service from './storefront.service';

/**
 * Vitrine pública (§6.1 do PLAN.md).
 *
 * Sem autenticação. O tenant vem do host, resolvido por `resolveTenantByHost`
 * no mount de `/storefront` — por isso `tenantRoute` funciona aqui apesar de
 * não haver token: ele encontra o tenant já no contexto.
 */

const codeParamSchema = z.object({ code: z.coerce.number().int().positive() });

export const storefrontPublicRouter: Router = Router();

storefrontPublicRouter.get(
  '/config',
  tenantRoute({
    handler: ({ tx, req }) => {
      if (!req.tenant) throw internal('Vitrine sem tenant resolvido.');
      return service.getConfig(tx, req.tenant);
    },
  }),
);

storefrontPublicRouter.get(
  '/menu',
  tenantRoute({
    query: menuQuerySchema,
    handler: ({ tx, query }) => service.getMenu(tx, query.for),
  }),
);

storefrontPublicRouter.get(
  '/products/:slug',
  tenantRoute({
    params: productSlugParamSchema,
    handler: ({ tx, params }) => service.getProduct(tx, params.slug),
  }),
);

storefrontPublicRouter.get(
  '/delivery-zones',
  tenantRoute({ handler: ({ tx }) => service.listZones(tx) }),
);

storefrontPublicRouter.post(
  '/delivery-quote',
  tenantRoute({
    body: deliveryQuoteRequestSchema,
    handler: ({ tx, tenantId, body }) => service.quoteDelivery(tx, tenantId, body),
  }),
);

/**
 * Criação de pedido.
 *
 * `writeLimiter` além do limite geral da vitrine: pedido falso não só polui o
 * kanban, ele SEGURA ESTOQUE por reserva (D14). E `Idempotency-Key` é
 * obrigatória — a vitrine roda em celular com rede ruim, e o cliente aperta
 * "enviar" duas vezes.
 */
storefrontPublicRouter.post(
  '/orders',
  writeLimiter,
  requireIdempotencyKey,
  tenantRoute({
    body: createStorefrontOrderRequestSchema,
    status: 201,
    handler: ({ tx, body, req }) => {
      if (!req.tenant) throw internal('Vitrine sem tenant resolvido.');
      return service.createOrder(tx, req.tenant, body, getIdempotencyKey(req)!);
    },
  }),
);

storefrontPublicRouter.post(
  '/whatsapp-draft',
  writeLimiter,
  requireIdempotencyKey,
  tenantRoute({
    body: whatsappDraftRequestSchema,
    handler: ({ tx, body, req }) => {
      if (!req.tenant) throw internal('Vitrine sem tenant resolvido.');
      return service.whatsappDraft(tx, req.tenant, body, getIdempotencyKey(req)!);
    },
  }),
);

/* --- Encomendas (D10) --- */

storefrontPublicRouter.get(
  '/availability',
  tenantRoute({
    query: storefrontAvailabilityQuerySchema,
    handler: ({ tx, query, req }) => {
      if (!req.tenant) throw internal('Vitrine sem tenant resolvido.');
      return service.getPublicAvailability(tx, req.tenant, query.from, query.to);
    },
  }),
);

storefrontPublicRouter.post(
  '/preorders',
  writeLimiter,
  requireIdempotencyKey,
  tenantRoute({
    body: createStorefrontPreorderRequestSchema,
    status: 201,
    handler: ({ tx, body, req }) => {
      if (!req.tenant) throw internal('Vitrine sem tenant resolvido.');
      return service.createPreorder(tx, req.tenant, body, getIdempotencyKey(req)!);
    },
  }),
);

/** Acompanhamento: exige código E telefone (D4). */
storefrontPublicRouter.get(
  '/orders/:code',
  tenantRoute({
    params: codeParamSchema,
    query: trackOrderQuerySchema,
    handler: ({ tx, params, query }) => service.trackOrder(tx, params.code, query.phone),
  }),
);

/** Mesma coisa, para encomenda. */
storefrontPublicRouter.get(
  '/preorders/:code',
  tenantRoute({
    params: codeParamSchema,
    query: trackOrderQuerySchema,
    handler: ({ tx, params, query }) => service.trackPreorder(tx, params.code, query.phone),
  }),
);
