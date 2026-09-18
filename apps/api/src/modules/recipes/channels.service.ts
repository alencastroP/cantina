import type {
  CreateSalesChannelRequest,
  Page,
  SalesChannel,
  UpdateSalesChannelRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as repository from './recipes.repository';

/**
 * Canais de venda (D13).
 *
 * Cadastrados por empresa porque a comissão do iFood de uma padaria não é a
 * mesma de outra. O pedido guarda o canal, e é isso que permite comparar
 * margem entre canais no relatório — não só simular na tela.
 */

function toChannel(row: repository.SalesChannelRow): SalesChannel {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    commissionPercent: row.commissionPercent,
    paymentFeePercent: row.paymentFeePercent,
    fixedFeeCents: row.fixedFeeCents,
    absorbsDeliveryFee: row.absorbsDeliveryFee,
    isDefault: row.isDefault,
    active: row.active,
  };
}

export async function list(
  tx: Transaction,
  query: { active?: boolean | undefined; cursor?: string | undefined; limit?: number | undefined },
): Promise<Page<SalesChannel>> {
  const limit = query.limit ?? 50;
  const rows = await repository.listSalesChannels(tx, {
    active: query.active,
    cursor: query.cursor,
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toChannel);

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreateSalesChannelRequest,
): Promise<SalesChannel> {
  try {
    const created = await repository.insertSalesChannel(tx, {
      tenantId,
      name: input.name,
      kind: input.kind,
      commissionPercent: input.commissionPercent,
      paymentFeePercent: input.paymentFeePercent,
      fixedFeeCents: input.fixedFeeCents,
      absorbsDeliveryFee: input.absorbsDeliveryFee,
      isDefault: input.isDefault,
      active: input.active,
    });

    if (created.isDefault) {
      await repository.clearDefaultSalesChannel(tx, created.id);
    }

    await recordAudit(tx, {
      tenantId,
      action: 'sales_channel.created',
      entityType: 'sales_channel',
      entityId: created.id,
      after: { name: created.name, commissionPercent: created.commissionPercent },
    });

    return toChannel(created);
  } catch (error) {
    if (isUniqueViolation(error, 'sales_channels_tenant_name_uq')) {
      throw conflict('Já existe um canal com este nome.', { name: input.name });
    }
    throw error;
  }
}

export async function update(
  tx: Transaction,
  tenantId: string,
  channelId: string,
  patch: UpdateSalesChannelRequest,
): Promise<SalesChannel> {
  const before = await repository.findSalesChannelById(tx, channelId);
  if (!before) throw notFound('Canal de venda não encontrado.');

  // A soma resultante é que importa, não a do corpo enviado: baixar só a
  // comissão por PATCH driblaria a validação do schema, que só vê o patch.
  const commission = patch.commissionPercent ?? before.commissionPercent;
  const payment = patch.paymentFeePercent ?? before.paymentFeePercent;
  if (commission + payment >= 100) {
    throw unprocessable('As taxas do canal somam 100% ou mais.', { commission, payment });
  }

  // Desativar o canal padrão deixaria a vitrine sem canal para atribuir aos
  // pedidos, e o relatório de margem sem referência.
  if (patch.active === false && before.isDefault) {
    throw conflict('Este é o canal padrão. Defina outro como padrão antes de desativá-lo.');
  }

  try {
    const updated = await repository.updateSalesChannel(tx, channelId, patch);
    if (!updated) throw notFound('Canal de venda não encontrado.');

    if (patch.isDefault === true) {
      await repository.clearDefaultSalesChannel(tx, channelId);
    }

    await recordAudit(tx, {
      tenantId,
      action: 'sales_channel.updated',
      entityType: 'sales_channel',
      entityId: channelId,
      before: {
        name: before.name,
        commissionPercent: before.commissionPercent,
        paymentFeePercent: before.paymentFeePercent,
        fixedFeeCents: before.fixedFeeCents,
      },
      after: {
        name: updated.name,
        commissionPercent: updated.commissionPercent,
        paymentFeePercent: updated.paymentFeePercent,
        fixedFeeCents: updated.fixedFeeCents,
      },
    });

    return toChannel(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'sales_channels_tenant_name_uq')) {
      throw conflict('Já existe um canal com este nome.');
    }
    throw error;
  }
}

/**
 * Remoção lógica: os pedidos antigos continuam apontando para o canal.
 * Sem isso, o relatório de margem por canal perderia o histórico inteiro
 * assim que uma parceria acabasse.
 */
export async function remove(
  tx: Transaction,
  tenantId: string,
  channelId: string,
): Promise<void> {
  const channel = await repository.findSalesChannelById(tx, channelId);
  if (!channel) throw notFound('Canal de venda não encontrado.');

  if (channel.isDefault) {
    throw conflict('Este é o canal padrão. Defina outro como padrão antes de removê-lo.');
  }

  await repository.softDeleteSalesChannel(tx, channelId);

  await recordAudit(tx, {
    tenantId,
    action: 'sales_channel.removed',
    entityType: 'sales_channel',
    entityId: channelId,
    before: { name: channel.name },
  });
}
