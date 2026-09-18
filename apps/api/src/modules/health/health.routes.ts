import { Router } from 'express';

import { checkDatabase } from '../../db';
import { openRoute } from '../../http/route';

/**
 * Health checks.
 *
 * `/health`  vivo — o processo respondeu. Usado pelo orquestrador para
 *            decidir reiniciar.
 * `/ready`   pronto — dependências respondem. Usado pelo balanceador para
 *            decidir mandar tráfego.
 *
 * Separar os dois evita o pior caso do deploy: o balanceador tirar todas as
 * instâncias do ar porque o banco piscou.
 */

const startedAt = Date.now();

export const healthRouter: Router = Router();

healthRouter.get(
  '/health',
  openRoute({
    handler: async () => ({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }),
  }),
);

healthRouter.get(
  '/health/ready',
  openRoute({
    handler: async ({ res }) => {
      const database = await checkDatabase();
      if (!database) {
        res.status(503);
      }
      return {
        status: database ? 'ready' : 'degraded',
        checks: { database },
      };
    },
  }),
);
