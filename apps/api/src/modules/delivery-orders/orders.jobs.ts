import { deliveryOrders, withTenant } from '@cantina/db';
import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { appDb, platformDb } from '../../db';
import { getBoss, JOBS, registerJob } from '../../jobs/index';
import { logger } from '../../shared/logger';
import * as repository from './orders.repository';
import { changeStatus } from './status.service';

/**
 * Expiração de reservas (D14).
 *
 * Um pedido que nasceu `pending` e nunca foi confirmado segura estoque. Sem
 * este job, um carrinho abandonado na vitrine deixaria o produto indisponível
 * para sempre — e o lojista perderia venda sem entender por quê.
 *
 * O pedido não é apagado: vira `canceled` com motivo, pela mesma porta de
 * transição de sempre. Assim a reserva é devolvida pelo caminho normal e o
 * histórico registra o que aconteceu.
 */

const BATCH_PER_TENANT = 100;

/**
 * Descobre quais empresas têm algo a expirar usando a conexão de plataforma,
 * e só então abre o contexto de cada uma. Varrer tenant por tenant seria N
 * consultas mesmo quando não há nada vencido.
 */
async function tenantsWithExpiredOrders(): Promise<string[]> {
  const rows = await platformDb.db
    .selectDistinct({ tenantId: deliveryOrders.tenantId })
    .from(deliveryOrders)
    .where(
      and(
        eq(deliveryOrders.status, 'pending'),
        isNotNull(deliveryOrders.expiresAt),
        lt(deliveryOrders.expiresAt, new Date()),
      ),
    )
    .limit(500);

  return rows.map((row) => row.tenantId);
}

export async function expireReservations(): Promise<{ tenants: number; orders: number }> {
  const tenantIds = await tenantsWithExpiredOrders();
  let expired = 0;

  for (const tenantId of tenantIds) {
    try {
      // Uma transação por empresa: o problema de uma não derruba as outras.
      await withTenant(appDb.db, tenantId, async (tx) => {
        const orders = await repository.findExpiredPending(tx, BATCH_PER_TENANT);

        for (const order of orders) {
          await changeStatus(tx, tenantId, order.id, 'canceled', {
            reason: 'Reserva expirada: o pedido não foi confirmado a tempo.',
            actorId: null,
          });
          expired += 1;
        }
      });
    } catch (error) {
      logger.error({ err: error, tenantId }, 'Falha ao expirar reservas do tenant');
    }
  }

  if (expired > 0) {
    logger.info({ tenants: tenantIds.length, orders: expired }, 'Reservas expiradas');
  }

  return { tenants: tenantIds.length, orders: expired };
}

/** Registrado no boot, junto com os outros consumidores da fila. */
export async function registerOrderJobs(): Promise<void> {
  await registerJob(JOBS.expireReservations, async () => {
    await expireReservations();
  });

  // A cada 5 minutos. O TTL da reserva é configurável por empresa
  // (`reservation_ttl_minutes`, padrão 60), então esta frequência dá
  // granularidade suficiente sem varrer o banco à toa.
  await getBoss().schedule(JOBS.expireReservations, '*/5 * * * *');
}
