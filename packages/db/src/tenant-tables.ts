import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

import * as schema from './schema/index';

/**
 * Quais tabelas recebem política de RLS.
 *
 * A lista é DERIVADA do schema (toda tabela com coluna `tenant_id`), não
 * escrita à mão. Uma lista manual esquecida é exatamente como um vazamento
 * entre empresas nasce: alguém cria a tabela, esquece de registrar, e a
 * política nunca é aplicada.
 */

/**
 * Tabelas da camada de plataforma. Algumas TÊM `tenant_id` mas ficam fora do
 * RLS de propósito:
 *
 * - `tenant_domains` é lida na resolução de host, ANTES de existir tenant no
 *   contexto — a consulta roda pela conexão de plataforma.
 * - `subscriptions` e `subscription_invoices` são gestão de assinatura, não
 *   dado operacional da loja.
 */
export const PLATFORM_TABLES: ReadonlySet<string> = new Set([
  'plans',
  'tenants',
  'tenant_domains',
  'subscriptions',
  'subscription_invoices',
  'webhook_events',
  'platform_users',
  // `tenant_counters` NÃO entra aqui, apesar de nascer junto com o tenant.
  // Ela é incrementada dentro da transação que cria o pedido, pela conexão
  // da aplicação — tratá-la como tabela de plataforma revogaria o acesso do
  // papel `cantina_app` e quebraria toda criação de pedido. Tem `tenant_id`,
  // então recebe RLS como qualquer outra tabela do tenant.
]);

export const TENANT_COLUMN = 'tenant_id';

export interface TableInfo {
  name: string;
  hasTenantColumn: boolean;
}

export function allTables(): TableInfo[] {
  const tables: TableInfo[] = [];

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    tables.push({
      name: config.name,
      hasTenantColumn: config.columns.some((column) => column.name === TENANT_COLUMN),
    });
  }

  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

/** Tabelas que precisam de política de isolamento por tenant. */
export function tenantTableNames(): string[] {
  return allTables()
    .filter((table) => table.hasTenantColumn && !PLATFORM_TABLES.has(table.name))
    .map((table) => table.name);
}

/**
 * Tabelas suspeitas: não são de plataforma e não têm `tenant_id`.
 * Aparecer aqui é quase sempre esquecimento — o script de RLS avisa.
 */
export function unscopedTableNames(): string[] {
  return allTables()
    .filter((table) => !table.hasTenantColumn && !PLATFORM_TABLES.has(table.name))
    .map((table) => table.name);
}
