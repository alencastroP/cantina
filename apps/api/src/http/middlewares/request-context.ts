import type { RequestHandler } from 'express';
import { uuidv7 } from 'uuidv7';

import { logger } from '../../shared/logger';
import { runWithContext, type RequestContext } from '../../shared/request-context';

/**
 * Primeiro middleware da cadeia. Cria o contexto e o mantém disponível em
 * toda a árvore assíncrona da requisição.
 *
 * O `requestId` volta no header e aparece no envelope de erro — é o que
 * transforma "deu erro no pedido" num log encontrável.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.length <= 64 ? incoming : uuidv7();

  res.setHeader('X-Request-Id', requestId);

  const context: RequestContext = {
    requestId,
    tenantId: null,
    userId: null,
    role: null,
    scope: 'public',
    ip: req.ip ?? null,
    logger: logger.child({ requestId }),
  };

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    context.logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        tenantId: context.tenantId,
      },
      'requisição',
    );
  });

  runWithContext(context, () => {
    next();
  });
};
