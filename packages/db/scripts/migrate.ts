import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Defina DATABASE_ADMIN_URL no .env da raiz.');
  }

  const pool = new pg.Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: resolve(here, '../migrations') });
    console.log('  Migrations aplicadas.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
