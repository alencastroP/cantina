import { sql } from 'drizzle-orm';

import type { Database, Transaction } from './client';

/**
 * Contexto de tenant no banco (§3 do PLAN.md, invariante 1).
 *
 * Toda rota de tenant executa dentro de UMA transação que começa definindo
 * `app.tenant_id`. As políticas de RLS comparam `tenant_id` com esse valor,
 * então uma query sem `where` devolve zero linhas em vez de vazar dados de
 * outra empresa.
 *
 * `set_config(..., true)` é local à transação: no COMMIT ou ROLLBACK o valor
 * some junto com ela. Isso é o que impede a conexão de voltar ao pool
 * carregando o tenant do request anterior.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(tenantId)) {
    // Nunca deveria acontecer: o tenant vem do token ou do host resolvido,
    // jamais do corpo da requisição (invariante 2). Se chegou torto aqui,
    // é bug de composição — falhar alto é melhor que consultar com contexto
    // inválido e receber "zero linhas" como se fosse resposta legítima.
    throw new TenantContextError(`tenantId inválido no contexto de RLS: ${tenantId}`);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Transação sem tenant, para a conexão de plataforma (papel com BYPASSRLS).
 * Uso restrito ao módulo `platform`, às migrations e à resolução de host.
 */
export async function withPlatform<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}

/** Diagnóstico: qual tenant está ativo na transação atual. */
export async function currentTenantId(tx: Transaction): Promise<string | null> {
  const result = await tx.execute<{ tenant_id: string | null }>(
    sql`select nullif(current_setting('app.tenant_id', true), '') as tenant_id`,
  );
  return result.rows[0]?.tenant_id ?? null;
}
