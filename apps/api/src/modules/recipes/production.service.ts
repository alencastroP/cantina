import type { CreateProductionRequest, ProductionResult } from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import { roundCents } from '@cantina/domain';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { applyMovements, type MovementRequest } from '../inventory/stock.service';
import * as repository from './recipes.repository';
import { computeUnitCost } from './recipes.service';

/**
 * Produção (D19) — o elo entre os dois estoques.
 *
 * "Produzi 20 coxinhas" consome os insumos da receita e dá entrada no estoque
 * do produto, tudo na MESMA transação. Sem esta operação, o consumo de insumo
 * do mês nunca fecha com o produto pronto vendido.
 *
 * Mora no módulo 4 e não no 3 porque explodir a receita exige `recipe_items`,
 * e essa tabela tem um dono só.
 */
export async function produce(
  tx: Transaction,
  tenantId: string,
  input: CreateProductionRequest,
): Promise<ProductionResult> {
  const variant = await repository.findVariantContext(tx, input.productVariantId);
  if (!variant) throw notFound('Variação de produto não encontrada.');

  /**
   * Produto `on_demand` não se produz antecipadamente.
   *
   * A disponibilidade dele é derivada dos insumos (D9), então o estoque de
   * produto pronto que a produção criaria seria simplesmente ignorado pela
   * vitrine — o lojista veria o número subir e nada mudar na loja.
   */
  if (variant.stockMode !== 'tracked') {
    throw conflict(
      'Este produto é feito sob demanda: a disponibilidade dele vem dos insumos. ' +
        'Para produzir e estocar, mude o controle de estoque para "contar unidades".',
      { stockMode: variant.stockMode },
    );
  }

  const recipe = await repository.findRecipeByVariant(tx, input.productVariantId);
  if (!recipe) {
    throw unprocessable(
      'Cadastre a ficha técnica antes de registrar produção — é ela que diz o que consumir.',
    );
  }

  const items = await repository.listRecipeItems(tx, recipe.id);
  if (items.length === 0) {
    throw unprocessable('A ficha técnica está vazia.');
  }

  const cost = await computeUnitCost(tx, input.productVariantId);

  // Quanto de cada insumo sai, para a quantidade produzida. A perda entra
  // aqui: ela é consumo real, não um número de planilha.
  const batches = input.qty / recipe.yieldQty;
  const consumption = items.map((item) => ({
    supplyId: item.supplyId,
    supplyName: item.supplyName,
    unit: item.unit,
    qty: item.qty * (1 + item.wastePercent / 100) * batches,
  }));

  const entry = await repository.insertProductionEntry(tx, {
    tenantId,
    productVariantId: input.productVariantId,
    qty: input.qty,
    unitCost: cost.unitCostCents,
    producedAt: input.producedAt ? new Date(input.producedAt) : new Date(),
    notes: input.notes ?? null,
  });

  /**
   * Saída dos insumos e entrada do produto num lote só.
   *
   * `applyMovements` trava tudo em ordem determinística — o que importa aqui
   * mais que em qualquer outro lugar, porque a produção toca muitos itens de
   * uma vez e é o caminho mais provável de dois usuários colidirem.
   */
  const movements: MovementRequest[] = [
    ...consumption.map<MovementRequest>((line) => ({
      kind: 'supply',
      refId: line.supplyId,
      type: 'production_out',
      qty: line.qty,
    })),
    {
      kind: 'product_variant',
      refId: input.productVariantId,
      type: 'production_in',
      qty: input.qty,
      unitCost: cost.unitCostCents,
    },
  ];

  const applied = await applyMovements(tx, tenantId, movements, {
    source: 'production',
    sourceId: entry.id,
  });

  const balanceOf = new Map(
    applied.map((result) => [`${result.kind}:${result.refId}`, result.balance]),
  );

  await recordAudit(tx, {
    tenantId,
    action: 'production.registered',
    entityType: 'production_entry',
    entityId: entry.id,
    after: {
      variantId: input.productVariantId,
      qty: input.qty,
      unitCostCents: cost.unitCostCents,
      supplies: consumption.length,
    },
  });

  return {
    id: entry.id,
    productVariantId: input.productVariantId,
    productName: variant.productName,
    variantName: variant.variantName,
    qty: input.qty,
    unitCostCents: cost.unitCostCents,
    totalCostCents: roundCents(cost.unitCostCents * input.qty),
    qtyOnHandAfter:
      balanceOf.get(`product_variant:${input.productVariantId}`)?.qtyOnHand ?? 0,
    consumed: consumption.map((line) => ({
      supplyId: line.supplyId,
      supplyName: line.supplyName,
      unit: line.unit,
      qty: line.qty,
      qtyOnHandAfter: balanceOf.get(`supply:${line.supplyId}`)?.qtyOnHand ?? 0,
    })),
    producedAt: entry.producedAt.toISOString(),
  };
}
