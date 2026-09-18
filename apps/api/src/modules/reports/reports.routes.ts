import {
  productsQuerySchema,
  reportRangeQuerySchema,
  salesQuerySchema,
} from '@cantina/contracts';
import { Router } from 'express';

import { requireRole } from '../../http/middlewares/auth';
import { tenantRoute } from '../../http/route';
import * as service from './reports.service';

/**
 * Relatórios (§6.9 do PLAN.md, módulo 10).
 *
 * Mesmo recorte de papel do financeiro: `staff` não vê resultado do mês, e o
 * contador (`finance`) vê sem precisar de acesso ao kanban.
 *
 * Tudo aqui é leitura — nenhuma rota usa `requireActiveTenant`. Um lojista em
 * atraso continua enxergando os próprios números; é o que ele precisa para
 * decidir pagar (§ do middleware de tenant).
 */
const reportsAccess = requireRole('owner', 'manager', 'finance');

export const reportsRouter: Router = Router();

reportsRouter.use(reportsAccess);

reportsRouter.get(
  '/summary',
  tenantRoute({
    query: reportRangeQuerySchema,
    handler: ({ tx, query, req }) => service.summary(tx, query, req.tenant!.timeZone),
  }),
);

reportsRouter.get(
  '/sales',
  tenantRoute({
    query: salesQuerySchema,
    handler: ({ tx, query, req }) =>
      service.sales(tx, query, query.groupBy, req.tenant!.timeZone),
  }),
);

reportsRouter.get(
  '/products',
  tenantRoute({
    query: productsQuerySchema,
    handler: ({ tx, query, req }) =>
      service.products(tx, query, query.orderBy, query.limit, req.tenant!.timeZone),
  }),
);

reportsRouter.get(
  '/costs',
  tenantRoute({
    query: reportRangeQuerySchema,
    handler: ({ tx, query, req }) => service.costs(tx, query, req.tenant!.timeZone),
  }),
);
