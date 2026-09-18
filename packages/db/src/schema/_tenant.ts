import { uuid } from 'drizzle-orm/pg-core';

import { tenants } from './platform';

/**
 * Coluna de tenant.
 *
 * Toda tabela do domínio a carrega, e toda chave composta começa por ela
 * (§3 do PLAN.md) — nenhuma query jamais cruza empresas, então `tenant_id`
 * é sempre a coluna mais seletiva do índice.
 *
 * A política de RLS que protege essas tabelas é gerada por
 * `scripts/apply-rls.ts` a partir de `src/tenant-tables.ts`.
 */
export const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
