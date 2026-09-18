import { createDb, type DbHandle } from '@cantina/db';

import { env, isDevelopment } from './config/env';
import { logger } from './shared/logger';

/**
 * Duas conexões, e a separação entre elas é o coração do isolamento (§3).
 *
 *   appDb       papel `cantina_app`, SUJEITO a RLS.
 *               Toda rota de tenant e toda rota de vitrine.
 *
 *   platformDb  papel com BYPASSRLS.
 *               Só: módulo `platform`, resolução de host e webhooks.
 *
 * A regra prática: se você está prestes a usar `platformDb` dentro de um
 * módulo de negócio, está fazendo algo errado.
 */

export const appDb: DbHandle = createDb({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  logger: isDevelopment,
  applicationName: 'cantina-api',
});

export const platformDb: DbHandle = createDb({
  connectionString: env.DATABASE_ADMIN_URL,
  max: 4,
  logger: false,
  applicationName: 'cantina-api-platform',
});

export async function closeDatabases(): Promise<void> {
  await Promise.allSettled([appDb.close(), platformDb.close()]);
  logger.info('Conexões de banco encerradas.');
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await appDb.pool.query('select 1');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Banco indisponível');
    return false;
  }
}
