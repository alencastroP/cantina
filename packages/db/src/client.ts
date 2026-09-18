import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index';

/**
 * Postgres NUMERIC (OID 1700) volta do driver como STRING por padrão — é
 * assim que o `pg` evita perder precisão em valores arbitrariamente grandes.
 *
 * As colunas `qty`/`unitCost`/`percent` (schema/_columns.ts) pedem `mode:
 * 'number'` ao Drizzle, e isso converte certo quando a coluna é lida direto.
 * Mas em expressões `sql<number>\`coalesce(...)\`` (agregações, somas) o
 * Drizzle só repassa o que o driver devolveu — o `<number>` do TypeScript é
 * só o tipo, não converte nada em runtime. Sem isso, `GET /supplies/:id`
 * devolvia `qtyOnHand: "5000.0000"` (string) em vez de `5000`.
 *
 * Registrar aqui, uma vez, corrige a classe inteira — nenhum valor do
 * domínio (gramas, percentuais, custo por grama) chega perto do limite de
 * precisão de um float de 64 bits.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => parseFloat(value));

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
