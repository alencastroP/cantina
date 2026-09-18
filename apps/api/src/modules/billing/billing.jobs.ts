import { subscriptions, tenants, withPlatform } from '@cantina/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { platformDb } from '../../db';
import { getBoss, JOBS, registerJob } from '../../jobs/index';
import { logger } from '../../shared/logger';
import * as repository from '../platform/platform.repository';

/**
 * Cobrança em atraso e fim de teste (módulo 11).
 *
 * A escada de consequências é deliberadamente lenta, e cada degrau tem um
 * motivo:
 *
 *   vencimento passa       → fatura vira `overdue`, assinatura `past_due`,
 *                            empresa em somente-leitura. Ela continua vendo
 *                            os próprios dados e o boleto — tirar o acesso
 *                            de quem está atrasado é o jeito mais rápido de
 *                            garantir que não pague.
 *   15 dias de atraso      → empresa suspensa: a vitrine sai do ar. Só aqui,
 *                            porque este é o passo que custa faturamento ao
 *                            cliente e não tem desfazer instantâneo.
 *   teste termina          → empresa em somente-leitura, não suspensa. Quem
 *                            testou por 14 dias e não decidiu ainda pode
 *                            decidir; a loja no ar é o argumento de venda.
 */

const SUSPEND_AFTER_DAYS = 15;

export async function runDunning(): Promise<{
  overdue: number;
  suspended: number;
  trialsEnded: number;
}> {
  const now = new Date();

  return withPlatform(platformDb.db, async (tx) => {
    /* 1. Faturas que venceram desde a última rodada. */
    const affected = await repository.markOverdueInvoices(tx, now);
    const tenantIds = [...new Set(affected)];

    if (tenantIds.length > 0) {
      await tx
        .update(subscriptions)
        .set({ status: 'past_due', updatedAt: now })
        .where(
          and(
            inArray(subscriptions.tenantId, tenantIds),
            eq(subscriptions.status, 'active'),
          ),
        );

      // `suspended` e `canceled` não voltam para `past_due`: quem foi
      // suspenso à mão só é reativado à mão.
      await tx
        .update(tenants)
        .set({ status: 'past_due', updatedAt: now })
        .where(and(inArray(tenants.id, tenantIds), eq(tenants.status, 'active')));
    }

    /* 2. Atraso longo o bastante para tirar a vitrine do ar. */
    const limit = new Date(now);
    limit.setUTCDate(limit.getUTCDate() - SUSPEND_AFTER_DAYS);

    const toSuspend = await tx
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(
        and(
          eq(tenants.status, 'past_due'),
          sql`exists (
            select 1 from subscription_invoices i
            where i.tenant_id = ${tenants.id}
              and i.status = 'overdue'
              and i.due_date < ${limit}
          )`,
        ),
      )
      .limit(200);

    if (toSuspend.length > 0) {
      await tx
        .update(tenants)
        .set({ status: 'suspended', updatedAt: now })
        .where(inArray(tenants.id, toSuspend.map((row) => row.id)));

      logger.warn(
        { tenants: toSuspend.map((row) => row.name) },
        'Empresas suspensas por atraso',
      );
    }

    /* 3. Testes que acabaram. */
    const expired = await repository.expiredTrials(tx, now);

    if (expired.length > 0) {
      await tx
        .update(tenants)
        .set({ status: 'past_due', updatedAt: now })
        .where(inArray(tenants.id, expired.map((row) => row.id)));

      await tx
        .update(subscriptions)
        .set({ status: 'expired', updatedAt: now })
        .where(
          and(
            inArray(subscriptions.tenantId, expired.map((row) => row.id)),
            eq(subscriptions.status, 'trialing'),
          ),
        );

      logger.info({ count: expired.length }, 'Testes encerrados');
    }

    return {
      overdue: tenantIds.length,
      suspended: toSuspend.length,
      trialsEnded: expired.length,
    };
  });
}

export async function registerBillingJobs(): Promise<void> {
  await registerJob(JOBS.dunning, async () => {
    await runDunning();
  });

  // Uma vez por dia, às 4h — depois das recorrências do financeiro (3h), para
  // que os dois relatórios do dia contem a mesma coisa.
  await getBoss().schedule(JOBS.dunning, '0 4 * * *');
}

/** Exportado para o teste: a fronteira de dias é a regra que vale conferir. */
export function shouldSuspend(dueDate: Date, now: Date, afterDays = SUSPEND_AFTER_DAYS): boolean {
  const limit = new Date(now);
  limit.setUTCDate(limit.getUTCDate() - afterDays);
  return dueDate < limit;
}
