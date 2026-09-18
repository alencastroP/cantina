import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

/**
 * As migrations rodam pela conexão ADMINISTRATIVA.
 * O papel da aplicação (`cantina_app`) não tem DDL — é justamente o que
 * impede uma migration acidental de sair de dentro de um request.
 */
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('Defina DATABASE_ADMIN_URL (ou DATABASE_URL) no .env da raiz.');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
