import { preorders, withTenant } from '@cantina/db';
import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { appDb, platformDb } from '../../db';
import { getBoss, JOBS, registerJob } from '../../jobs/index';
import { logger } from '../../shared/logger';
import * as repository from './preorders.repository';
import { changeStatus } from './status.service';

/**
 * Expiração de encomendas pendentes (D14).
 *
 * Aqui a reserva abandonada custa DUAS coisas: o estoque preso, como no
 * delivery, e a vaga na agenda — que é escassa de verdade. Um carrinho
 * esquecido pode bloquear o sábado inteiro da confeitaria.
 *
 * O cancelamento passa pela porta normal, então a vaga e o estoque voltam
 * pelo mesmo caminho de sempre.
 */

const BATCH_PER_TENANT = 100;

async function tenantsWithExpired(): Promise<string[]> {
  const rows = await platformDb.db
    .selectDistinct({ tenantId: preorders.tenantId })
    .from(preorders)
    .where(
      and(
        eq(preorders.status, 'pending'),
        isNotNull(preorders.expiresAt),
        lt(preorders.expiresAt, new Date()),
      ),
    )
    .limit(500);

  return rows.map((row) => row.tenantId);
}

export async function expirePreorders(): Promise<{ tenants: number; preorders: number }> {
  const tenantIds = await tenantsWithExpired();
  let expired = 0;

  for (const tenantId of tenantIds) {
    try {
      await withTenant(appDb.db, tenantId, async (tx) => {
        const rows = await repository.findExpiredPending(tx, BATCH_PER_TENANT);

        for (const row of rows) {
          await changeStatus(tx, tenantId, row.id, 'canceled', {
            reason: 'Reserva expirada: a encomenda não foi confirmada a tempo.',
            actorId: null,
          });
          expired += 1;
        }
      });
    } catch (error) {
      logger.error({ err: error, tenantId }, 'Falha ao expirar encomendas do tenant');
    }
  }

  if (expired > 0) {
    logger.info({ tenants: tenantIds.length, preorders: expired }, 'Encomendas expiradas');
  }

  return { tenants: tenantIds.length, preorders: expired };
}

export async function registerPreorderJobs(): Promise<void> {
  await registerJob(JOBS.expirePreorders, async () => {
    await expirePreorders();
  });

  await getBoss().schedule(JOBS.expirePreorders, '*/5 * * * *');
}
