import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import pg from 'pg';

import { tenantTableNames, unscopedTableNames, PLATFORM_TABLES } from '../src/tenant-tables';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });

const APP_ROLE = 'cantina_app';
const PLATFORM_ROLE = 'cantina_platform';

/**
 * Aplica as políticas de RLS e as views.
 *
 * Roda depois de toda migration. É idempotente — pode rodar quantas vezes
 * quiser, e é isso que permite chamá-lo no deploy sem pensar.
 */

function policySql(table: string): string {
  return `
ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "${table}";

-- current_setting(..., true) devolve NULL quando o contexto não foi definido.
-- NULL na comparação = zero linhas. Ou seja: esquecer de abrir o contexto
-- não expõe nada; apenas não retorna nada. É o modo de falhar que se quer.
CREATE POLICY tenant_isolation ON "${table}"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO ${APP_ROLE};
GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO ${PLATFORM_ROLE};
`.trim();
}

function platformGrantSql(table: string): string {
  // Tabelas de plataforma: só o papel de plataforma enxerga.
  return `
REVOKE ALL ON "${table}" FROM ${APP_ROLE};
GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO ${PLATFORM_ROLE};
`.trim();
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Defina DATABASE_ADMIN_URL no .env da raiz.');
  }

  const tenantTables = tenantTableNames();
  const orphans = unscopedTableNames();

  if (orphans.length > 0) {
    console.warn(
      `\n  Atenção: ${orphans.length} tabela(s) sem tenant_id e fora da lista de plataforma:\n` +
        orphans.map((name) => `    - ${name}`).join('\n') +
        '\n  Ou falta a coluna, ou falta registrá-las em PLATFORM_TABLES.\n',
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const table of tenantTables) {
      await client.query(policySql(table));
    }

    for (const table of PLATFORM_TABLES) {
      const exists = await client.query('SELECT to_regclass($1) AS oid', [`public.${table}`]);
      if (exists.rows[0]?.oid) {
        await client.query(platformGrantSql(table));
      }
    }

    const views = await readFile(resolve(here, '../sql/views.sql'), 'utf8');
    await client.query(views);

    await client.query('COMMIT');

    console.log(`  RLS aplicado em ${tenantTables.length} tabela(s):`);
    for (const table of tenantTables) console.log(`    - ${table}`);
    console.log(`  Views recriadas. Papéis: ${APP_ROLE} (com RLS), ${PLATFORM_ROLE} (bypass).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
