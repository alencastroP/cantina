import type { Transaction } from '@cantina/db';
import { assertPreorderTransition, type PreorderStatus } from '@cantina/domain';

import { conflict, notFound } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import * as customersService from '../customers/customers.service';
import * as financeService from '../finance/finance.service';
import {
  commitSaleBySource,
  releaseReservationBySource,
  restoreBySource,
} from '../inventory/stock.service';
import * as availabilityService from './availability.service';
import * as repository from './preorders.repository';

/**
 * Máquina de estados do kanban de encomendas (invariante 5).
 *
 * Além dos efeitos de estoque que o delivery já tinha, aqui há um terceiro: a
 * VAGA na agenda. Confirmar converte reserva em uso; cancelar devolve — e de
 * qual contador devolver depende de onde a encomenda estava.
 */

export interface TransitionOptions {
  reason?: string | null;
  actorId?: string | null;
}

const TIMESTAMP_BY_STATUS: Partial<Record<PreorderStatus, string>> = {
  confirmed: 'confirmedAt',
  in_production: 'productionStartedAt',
  ready: 'readyAt',
  completed: 'completedAt',
  canceled: 'canceledAt',
};

export async function changeStatus(
  tx: Transaction,
  tenantId: string,
  preorderId: string,
  to: PreorderStatus,
  options: TransitionOptions = {},
): Promise<repository.PreorderRow> {
  const preorder = await repository.lockById(tx, preorderId);
  if (!preorder) throw notFound('Encomenda não encontrada.');

  if (preorder.status === to) {
    throw conflict(`A encomenda já está em "${to}".`, { status: to });
  }

  const effects = assertPreorderTransition(preorder.status, to);

  switch (effects.stock) {
    case 'commit':
      await commitSaleBySource(tx, tenantId, 'preorder', preorderId);
      break;
    case 'release_reservation':
      await releaseReservationBySource(tx, tenantId, 'preorder', preorderId);
      break;
    case 'restore':
      await restoreBySource(tx, tenantId, 'preorder', preorderId);
      break;
    case 'none':
      break;
  }

  if (preorder.availabilityDayId) {
    if (effects.slot === 'consume') {
      await availabilityService.consumeSlot(tx, preorder.availabilityDayId);
    } else if (effects.slot === 'release') {
      /**
       * De qual contador devolver.
       *
       * Encomenda ainda `pending` estava em `reserved`; a partir de
       * `confirmed` ela já tinha virado `used`. Devolver do contador errado
       * faria a agenda dizer que há vaga onde não há — e o lojista aceitaria
       * uma encomenda que não consegue produzir.
       */
      await availabilityService.releaseSlot(
        tx,
        preorder.availabilityDayId,
        preorder.status === 'pending',
      );
    }
  }

  const now = new Date();
  const patch: Partial<repository.PreorderRow> = {
    status: to,
    statusChangedAt: now,
    expiresAt: to === 'pending' ? preorder.expiresAt : null,
  };

  const field = TIMESTAMP_BY_STATUS[to];
  if (field) (patch as Record<string, unknown>)[field] = now;
  if (to === 'canceled') patch.cancelReason = options.reason ?? null;

  const updated = await repository.update(tx, preorderId, patch);
  if (!updated) throw notFound('Encomenda não encontrada.');

  // Encomenda entregue vira receita, com a mesma regra do delivery: `paid`
  // segue o pagamento, não a entrega.
  if (effects.revenue === 'recognize') {
    await financeService.recordAutoEntry(tx, tenantId, {
      source: 'preorder',
      sourceId: preorderId,
      direction: 'in',
      description: `Encomenda #${updated.code}`,
      amountCents: updated.totalCents,
      dueDate: now.toISOString().slice(0, 10),
      categoryName: 'Vendas',
      paid: updated.paymentStatus === 'paid',
    });
  }

  if (preorder.customerId) {
    await customersService.refreshStats(tx, preorder.customerId);
  }

  await recordAudit(tx, {
    tenantId,
    action: 'preorder.status_changed',
    entityType: 'preorder',
    entityId: preorderId,
    actorId: options.actorId ?? undefined,
    actorType: options.actorId === null ? 'system' : undefined,
    before: { status: preorder.status },
    after: { status: to, reason: options.reason ?? null, effects },
  });

  return updated;
}
