import type { SimulateRequest, SimulateResponse } from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import { channelMargin, priceForTargetMargin } from '@cantina/domain';

import { notFound, unprocessable } from '../../http/errors/app-error';
import * as repository from './recipes.repository';
import { computeUnitCost, toChannelFees } from './recipes.service';

/**
 * Simulador de margem (D13, §6.6 do PLAN.md).
 *
 * Responde à pergunta que o lojista realmente faz: "por quanto eu preciso
 * vender no iFood para ganhar o mesmo que ganho no balcão?".
 */

export async function simulate(
  tx: Transaction,
  input: SimulateRequest,
): Promise<SimulateResponse> {
  const variant = await repository.findVariantContext(tx, input.variantId);
  if (!variant) throw notFound('Variação de produto não encontrada.');

  const cost = await computeUnitCost(tx, input.variantId);
  const priceCents = input.priceCents ?? variant.priceCents;

  const channels = input.channelIds
    ? await repository.findSalesChannelsByIds(tx, input.channelIds)
    : await repository.listSalesChannels(tx, { active: true, limit: 20 });

  if (channels.length === 0) {
    throw unprocessable(
      'Nenhum canal de venda cadastrado. Cadastre ao menos um para simular a margem.',
    );
  }

  return {
    variantId: input.variantId,
    productName: variant.productName,
    variantName: variant.variantName,
    unitCostCents: cost.unitCostCents,
    // A tela precisa avisar: com insumo sem custo, a margem exibida é melhor
    // que a real, e decidir preço com base nela é como o negócio quebra.
    hasUnknownCost: cost.hasUnknownCost,
    channels: channels.map((channel) => {
      const fees = toChannelFees(channel);
      const result = channelMargin(
        {
          priceCents,
          unitCostCents: cost.unitCostCents,
          deliveryFeeCents: input.deliveryFeeCents ?? 0,
        },
        fees,
      );

      return {
        channelId: channel.id,
        channelName: channel.name,
        priceCents: result.priceCents,
        channelFeesCents: result.channelFeesCents,
        deliveryCostCents: result.deliveryCostCents,
        netRevenueCents: result.netRevenueCents,
        unitCostCents: result.unitCostCents,
        marginCents: result.marginCents,
        marginPercent: result.marginPercent,
        markupPercent: result.markupPercent,
        ...(input.targetMarginPercent === undefined
          ? {}
          : {
              suggestedPriceCents: priceForTargetMargin(
                cost.unitCostCents,
                input.targetMarginPercent,
                fees,
                input.deliveryFeeCents ?? 0,
              ),
            }),
      };
    }),
  };
}
