import { pino, type Logger } from 'pino';

import { env, isDevelopment } from '../config/env';

/**
 * Log estruturado. Em produção sai JSON (o agregador precisa disso);
 * em desenvolvimento sai formatado, para ser lido por gente.
 */
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'cantina-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      '*.tokenHash',
      'body.password',
    ],
    censor: '[redigido]',
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export type { Logger };
