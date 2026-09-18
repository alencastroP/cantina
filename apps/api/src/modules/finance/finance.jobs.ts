import { financeRecurrences, withTenant } from '@cantina/db';
import { and, eq, lte } from 'drizzle-orm';

import { appDb, platformDb } from '../../db';
import { getBoss, JOBS, registerJob } from '../../jobs/index';
import { logger } from '../../shared/logger';
import { materializeRecurrences } from './finance.service';

/**
 * Materialização de recorrências (§4.10).
 *
 * O aluguel de todo dia 5 não é uma regra consultada na hora de montar o
 * fluxo de caixa — vira um lançamento concreto, como qualquer outro. É o que
 * mantém a projeção auditável: o que a tela mostra existe no banco e pode ser
 * editado, baixado ou cancelado individualmente.
 */

async function tenantsWithDueRecurrences(today: string): Promise<string[]> {
  const rows = await platformDb.db
    .selectDistinct({ tenantId: financeRecurrences.tenantId })
    .from(financeRecurrences)
    .where(
      and(eq(financeRecurrences.active, true), lte(financeRecurrences.nextDueDate, today)),
    )
    .limit(500);

  return rows.map((row) => row.tenantId);
}

export async function runRecurrences(): Promise<{ tenants: number; entries: number }> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const tenantIds = await tenantsWithDueRecurrences(today);
  let created = 0;

  for (const tenantId of tenantIds) {
    try {
      await withTenant(appDb.db, tenantId, async (tx) => {
        created += await materializeRecurrences(tx, tenantId);
      });
    } catch (error) {
      logger.error({ err: error, tenantId }, 'Falha ao materializar recorrências');
    }
  }

  if (created > 0) {
    logger.info({ tenants: tenantIds.length, entries: created }, 'Recorrências geradas');
  }

  return { tenants: tenantIds.length, entries: created };
}

export async function registerFinanceJobs(): Promise<void> {
  await registerJob(JOBS.materializeRecurrences, async () => {
    await runRecurrences();
  });

  // Uma vez por dia, às 3h. Nada aqui é urgente — o que importa é que o
  // lançamento exista antes de alguém abrir o fluxo de caixa de manhã.
  await getBoss().schedule(JOBS.materializeRecurrences, '0 3 * * *');
}
