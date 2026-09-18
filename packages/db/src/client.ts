import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Aceita tanto a conexão quanto uma transação — assinatura padrão dos repositórios. */
export type Executor = Database | Transaction;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  connectionString: string;
  max?: number;
  /** Loga cada query. Só em desenvolvimento. */
  logger?: boolean;
  applicationName?: string;
}

export function createDb({
  connectionString,
  max = 10,
  logger = false,
  applicationName = 'cantina-api',
}: CreateDbOptions): DbHandle {
  const pool = new pg.Pool({
    connectionString,
    max,
    application_name: applicationName,
    // O contexto de tenant vive numa transação (SET LOCAL). Uma conexão
    // devolvida ao pool no meio disso vazaria o tenant para o próximo request,
    // então nada aqui pode reciclar conexão em transação aberta.
    allowExitOnIdle: false,
  });

  return {
    pool,
    db: drizzle(pool, { schema, logger }),
    close: () => pool.end(),
  };
}

export { schema };
