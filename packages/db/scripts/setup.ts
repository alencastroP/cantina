import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });

/**
 * Prepara o banco do zero: papéis → migrations → RLS.
 *
 * `npm run db:setup` na raiz. Idempotente.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Defina DATABASE_ADMIN_URL no .env da raiz.');
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const roles = await readFile(resolve(here, '../sql/roles.sql'), 'utf8');
    await client.query(roles);
    console.log('  Papéis criados (cantina_app, cantina_platform).');
  } finally {
    await client.end();
  }

  const { execSync } = await import('node:child_process');
  const run = (command: string) =>
    execSync(command, { cwd: resolve(here, '..'), stdio: 'inherit' });

  run('npm run migrate');
  run('npm run rls');

  console.log('\n  Banco pronto. Próximo passo: npm run db:seed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
