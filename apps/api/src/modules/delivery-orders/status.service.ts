import type { Transaction } from '@cantina/db';
import { assertDeliveryTransition, type DeliveryStatus } from '@cantina/domain';

import { conflict, notFound } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import * as customersService from '../customers/customers.service';
import * as financeService from '../finance/finance.service';
import {
  commitSaleBySource,
  releaseReservationBySource,
  restoreBySource,
} from '../inventory/stock.service';
import * as repository from './orders.repository';

/**
 * Máquina de estados do kanban de delivery (invariante 5).
 *
 * Esta é a ÚNICA porta de mudança de status. A regra de qual transição é
 * válida e o que ela dispara vive em `@cantina/domain`; aqui só se executa o
 * efeito, na mesma transação da mudança.
 */

export interface TransitionOptions {
  reason?: string | null;
  /** Quem mandou. `null` = job de expiração. */
  actorId?: string | null;
}

const TIMESTAMP_BY_STATUS: Partial<Record<DeliveryStatus, string>> = {
  confirmed: 'confirmedAt',
  ready: 'readyAt',
  out_for_delivery: 'dispatchedAt',
  completed: 'completedAt',
  canceled: 'canceledAt',
};

export async function changeStatus(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  to: DeliveryStatus,
  options: TransitionOptions = {},
): Promise<repository.OrderRow> {
  /**
   * Trava o pedido antes de decidir.
   *
   * Dois atendentes clicando "confirmar" ao mesmo tempo leriam o mesmo
   * `pending`, ambos passariam pela validação e ambos dariam baixa no
   * estoque. A trava faz o segundo esperar e encontrar o pedido já
   * confirmado, onde a máquina de estados o barra.
   */
  const order = await repository.lockOrderById(tx, orderId);
  if (!order) throw notFound('Pedido não encontrado.');

  if (order.status === to) {
    throw conflict(`O pedido já está em "${to}".`, { status: to });
  }

  // Lança se a transição não existir para este tipo de entrega.
  const effects = assertDeliveryTransition(order.status, to, order.fulfillment);

  switch (effects.stock) {
    case 'commit':
      await commitSaleBySource(tx, tenantId, 'delivery_order', orderId);
      break;
    case 'release_reservation':
      await releaseReservationBySource(tx, tenantId, 'delivery_order', orderId);
      break;
    case 'restore':
      await restoreBySource(tx, tenantId, 'delivery_order', orderId);
      break;
    case 'none':
      break;
  }

  const now = new Date();
  const patch: Partial<repository.OrderRow> = {
    status: to,
    statusChangedAt: now,
    // Confirmado deixa de expirar: a reserva virou saída (D14).
    expiresAt: to === 'pending' ? order.expiresAt : null,
  };

  const timestampField = TIMESTAMP_BY_STATUS[to];
  if (timestampField) {
    (patch as Record<string, unknown>)[timestampField] = now;
  }
  if (to === 'canceled') {
    patch.cancelReason = options.reason ?? null;
  }

  const updated = await repository.updateOrder(tx, orderId, patch);
  if (!updated) throw notFound('Pedido não encontrado.');

  /**
   * Pedido concluído vira lançamento de receita.
   *
   * `paid` acompanha o status de pagamento do pedido, não a conclusão: um
   * pedido entregue e ainda não pago é uma conta A RECEBER, e tratá-lo como
   * caixa inflaria o saldo com dinheiro que não chegou.
   *
   * O índice único em `(tenant_id, source, source_id)` garante que
   * reprocessar a transição não gere receita dobrada.
   */
  if (effects.revenue === 'recognize') {
    await financeService.recordAutoEntry(tx, tenantId, {
      source: 'delivery_order',
      sourceId: orderId,
      direction: 'in',
      description: `Pedido #${updated.code}`,
      amountCents: updated.totalCents,
      dueDate: now.toISOString().slice(0, 10),
      categoryName: 'Vendas',
      paid: updated.paymentStatus === 'paid',
    });
  }

  // Agregados do cliente recomputados a partir dos pedidos — nunca
  // incrementados, para não acumular drift a cada cancelamento (módulo 5).
  if (order.customerId) {
    await customersService.refreshStats(tx, order.customerId);
  }

  await recordAudit(tx, {
    tenantId,
    action: 'delivery_order.status_changed',
    entityType: 'delivery_order',
    entityId: orderId,
    actorId: options.actorId ?? undefined,
    actorType: options.actorId === null ? 'system' : undefined,
    before: { status: order.status },
    after: { status: to, reason: options.reason ?? null, effects },
  });

  return updated;
}
