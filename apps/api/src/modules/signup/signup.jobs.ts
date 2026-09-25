import { tenants, withPlatform } from '@cantina/db';
import { and, isNotNull, lt } from 'drizzle-orm';

import { platformDb } from '../../db';
import { billingProvider } from '../../integrations/billing';
import { getBoss, JOBS, registerJob } from '../../jobs/index';
import { logger } from '../../shared/logger';
import * as platformRepository from '../platform/platform.repository';

/**
 * Limpeza de cadastros de teste abandonados (SIGNUP-TESTE-GRATIS.md §3.8).
 *
 * Um tenant nascido pelo cadastro público e nunca confirmado pelo gateway
 * não pode ficar de pé para sempre: ele prende um `slug` bom sem que ninguém
 * use a loja. Passadas 24h ainda com `pendingConfirmationAt` preenchido, ele
 * é removido de verdade — nunca teve pedido, cliente nem produto, então não
 * há o que arquivar, e o cascade de `tenant_id` limpa o resto sozinho.
 *
 * A assinatura criada no GATEWAY (real, inclusive em produção) não morre
 * junto por cascade — é cancelada aqui, uma por uma, antes do delete local.
 * Sem isso, cada teste abandonado deixaria um cliente e uma assinatura órfãos
 * para sempre na conta do provedor.
 */
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

export async function expireAbandonedSignups(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - ABANDON_AFTER_MS);

  return withPlatform(platformDb.db, async (tx) => {
    const toRemove = await tx
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(and(isNotNull(tenants.pendingConfirmationAt), lt(tenants.pendingConfirmationAt, cutoff)))
      .limit(200);

    for (const tenant of toRemove) {
      const subscription = await platformRepository.findSubscriptionByTenant(tx, tenant.id);
      if (!subscription?.providerSubscriptionId) continue;

      try {
        await billingProvider.cancelSubscription(subscription.providerSubscriptionId);
      } catch (error) {
        // Segue para o delete de qualquer jeito: o tenant não pode ficar
        // preso a um cancelamento que falhou, e a linha órfã no gateway é
        // reconciliável à mão pelo `externalReference` (o próprio tenant_id).
        logger.error(
          { err: error, tenantId: tenant.id, providerSubscriptionId: subscription.providerSubscriptionId },
          'Falha ao cancelar assinatura de cadastro abandonado no gateway',
        );
      }
    }

    if (toRemove.length > 0) {
      await tx.delete(tenants).where(
        and(isNotNull(tenants.pendingConfirmationAt), lt(tenants.pendingConfirmationAt, cutoff)),
      );

      logger.info(
        { count: toRemove.length, slugs: toRemove.map((row) => row.slug) },
        'Cadastros de teste abandonados removidos',
      );
    }

    return { deleted: toRemove.length };
  });
}

export async function registerSignupJobs(): Promise<void> {
  await registerJob(JOBS.expireAbandonedSignups, async () => {
    await expireAbandonedSignups();
  });

  // Uma vez por dia, às 5h — depois da cobrança (4h), para não competir por
  // linhas de `tenants` na mesma janela.
  await getBoss().schedule(JOBS.expireAbandonedSignups, '0 5 * * *');
}
