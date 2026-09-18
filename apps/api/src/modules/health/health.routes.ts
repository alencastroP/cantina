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
      // Injetado automaticamente pelo Render — serve pra confirmar, sem
      // dúvida, qual commit está de fato no ar (útil quando o dashboard diz
      // "Deployed" mas o comportamento não bate com o código daquele commit).
      commit: process.env.RENDER_GIT_COMMIT ?? null,
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
