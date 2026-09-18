import {
  anonymizeCustomerRequestSchema,
  createAddressRequestSchema,
  createCustomerRequestSchema,
  cursorQuerySchema,
  listCustomersQuerySchema,
  updateAddressRequestSchema,
  updateCustomerRequestSchema,
  uuidSchema,
} from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireOwner } from '../../http/middlewares/auth';
import { requireActiveTenant } from '../../http/middlewares/tenant';
import { tenantRoute } from '../../http/route';
import * as service from './customers.service';

/**
 * Clientes (§6.3 do PLAN.md).
 *
 * Cadastro e edição ficam abertos a qualquer usuário logado: quem atende
 * corrige um telefone errado no meio do pedido, e exigir `manager` para isso
 * emperraria o balcão.
 *
 * Anonimização exige `owner`: é irreversível e apaga dado pessoal.
 */

const idParam = z.object({ id: uuidSchema });
const addressParam = z.object({ id: uuidSchema, addressId: uuidSchema });

export const customersRouter: Router = Router();

customersRouter.get(
  '/',
  tenantRoute({
    query: listCustomersQuerySchema,
    handler: ({ tx, query }) => service.list(tx, query),
  }),
);

customersRouter.post(
  '/',
  requireActiveTenant,
  tenantRoute({
    body: createCustomerRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body }) => service.create(tx, tenantId, body),
  }),
);

customersRouter.get(
  '/:id',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => service.get(tx, params.id),
  }),
);

customersRouter.patch(
  '/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: updateCustomerRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.update(tx, tenantId, params.id, body),
  }),
);

customersRouter.delete(
  '/:id',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    status: 204,
    handler: ({ tx, tenantId, params }) => service.remove(tx, tenantId, params.id),
  }),
);

/** Histórico unificado: delivery e encomendas na mesma lista (D6). */
customersRouter.get(
  '/:id/orders',
  tenantRoute({
    params: idParam,
    query: cursorQuerySchema,
    handler: ({ tx, params, query }) => service.listOrders(tx, params.id, query),
  }),
);

/* --- LGPD (D24) --- */

customersRouter.post(
  '/:id/anonymize',
  requireOwner,
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: anonymizeCustomerRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.anonymize(tx, tenantId, params.id, body),
  }),
);

/* --- Endereços --- */

customersRouter.get(
  '/:id/addresses',
  tenantRoute({
    params: idParam,
    handler: ({ tx, params }) => service.listAddresses(tx, params.id),
  }),
);

customersRouter.post(
  '/:id/addresses',
  requireActiveTenant,
  tenantRoute({
    params: idParam,
    body: createAddressRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, params, body }) =>
      service.createAddress(tx, tenantId, params.id, body),
  }),
);

customersRouter.patch(
  '/:id/addresses/:addressId',
  requireActiveTenant,
  tenantRoute({
    params: addressParam,
    body: updateAddressRequestSchema,
    handler: ({ tx, tenantId, params, body }) =>
      service.updateAddress(tx, tenantId, params.id, params.addressId, body),
  }),
);

customersRouter.delete(
  '/:id/addresses/:addressId',
  requireActiveTenant,
  tenantRoute({
    params: addressParam,
    status: 204,
    handler: ({ tx, tenantId, params }) =>
      service.removeAddress(tx, tenantId, params.id, params.addressId),
  }),
);
