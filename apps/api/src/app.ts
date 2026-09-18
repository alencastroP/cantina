import { API_VERSION } from '@cantina/contracts';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env, isProduction } from './config/env';
import { errorHandler, notFoundHandler } from './http/errors/error-handler';
import { requestContext } from './http/middlewares/request-context';
import { apiRouter } from './http/router';

/**
 * Montagem do Express. Sem regra de negócio aqui — só a ordem da cadeia,
 * que importa: contexto antes de tudo (para o log ter requestId), erro
 * depois de tudo (para capturar o que vier).
 */
export function createApp(): Express {
  const app = express();

  // Atrás de balanceador: req.ip precisa vir do X-Forwarded-For, ou o
  // rate limit por IP limita o balanceador em vez do cliente.
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  app.use(
    cors({
      origin: buildCorsOrigin(),
      credentials: true,
      // `Idempotency-Key` e `X-Tenant-Host` não são headers padrão:
      // sem listá-los, o preflight recusa a criação de pedido.
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Tenant-Host'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use(requestContext);

  app.use(`/api/${API_VERSION}`, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Origens permitidas: o app web e qualquer vitrine sob o domínio raiz —
 * cada empresa tem seu subdomínio (D2), então a lista não é enumerável e a
 * verificação precisa ser por sufixo.
 */
function buildCorsOrigin() {
  const rootSuffix = `.${env.ROOT_DOMAIN}`;

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Sem Origin: chamada servidor-a-servidor (o Next renderizando a vitrine).
    if (!origin) return callback(null, true);

    try {
      const { hostname } = new URL(origin);
      const allowed =
        origin === env.WEB_URL ||
        hostname === env.ROOT_DOMAIN ||
        hostname.endsWith(rootSuffix) ||
        (!isProduction && (hostname === 'localhost' || hostname === '127.0.0.1'));

      return callback(null, allowed);
    } catch {
      return callback(null, false);
    }
  };
}
