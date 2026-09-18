import type {
  CreatePurchaseRequest,
  ListPurchasesQuery,
  Page,
  SupplyPurchase,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  assertConversionFactor,
  purchaseUnitCost,
  weightedAverageUnitCost,
} from '@cantina/domain';

import { notFound, unprocessable } from '../../http/errors/app-error';
import * as financeService from '../finance/finance.service';
import { recordAudit } from '../../shared/audit';
import * as stockRepository from './stock.repository';
import { applyMovements } from './stock.service';
import * as repository from './supplies.repository';

/**
 * Compras de insumo (D11, §4.5 do PLAN.md).
 *
 * A compra é o documento que faz DUAS coisas na mesma transação:
 *   1. dá entrada no estoque;
 *   2. recalcula o custo médio ponderado.
 *
 * Elas não são telas separadas de propósito: separá-las é exatamente o que
 * faz o custo envelhecer sem ninguém perceber, e é o motivo de tanto negócio
 * pequeno achar que tem margem onde não tem.
 */

function toPurchase(
  row: repository.PurchaseWithNames,
  avgUnitCostAfter: number,
): SupplyPurchase {
  return {
    id: row.id,
    supplyId: row.supplyId,
    supplyName: row.supplyName,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    purchaseQty: row.purchaseQty,
    purchaseUnit: row.purchaseUnit,
    conversionFactor: row.conversionFactor,
    totalCents: row.totalCents,
    unitCost: row.unitCost,
    avgUnitCostAfter,
    purchasedAt: row.purchasedAt.toISOString(),
    invoiceRef: row.invoiceRef,
    note: row.note,
  };
}

export async function list(
  tx: Transaction,
  query: ListPurchasesQuery,
): Promise<Page<SupplyPurchase>> {
  const rows = await repository.listPurchases(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    supplyId: query.supplyId,
    supplierId: query.supplierId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  // O custo médio "depois" só é conhecido no momento da compra; na listagem
  // histórica devolvemos o custo daquela compra como referência.
  const items = page.map((row) => toPurchase(row, row.unitCost));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreatePurchaseRequest,
): Promise<SupplyPurchase> {
  const supply = await repository.findSupplyById(tx, input.supplyId);
  if (!supply) throw notFound('Insumo não encontrado.');

  if (input.supplierId) {
    const supplier = await repository.findSupplierById(tx, input.supplierId);
    if (!supplier) throw unprocessable('Fornecedor não encontrado.', { supplierId: input.supplierId });
  }

  // kg→g e l→ml têm conversão física conhecida; embalagem (`pct`, `cx`, `sc`,
  // `fd`) exige que o lojista diga quanto vem dentro.
  const conversionFactor = assertConversionFactor(
    input.purchaseUnit,
    supply.usageUnit,
    input.conversionFactor,
  );

  const unitCost = purchaseUnitCost({
    purchaseQty: input.purchaseQty,
    conversionFactor,
    totalCents: input.totalCents,
  });
  const usageQty = input.purchaseQty * conversionFactor;

  /**
   * A trava vem ANTES de ler o saldo.
   *
   * A média ponderada depende do saldo anterior à entrada. Ler sem travar
   * abriria a janela clássica: duas compras simultâneas leem o mesmo saldo,
   * cada uma calcula a média como se fosse a única, e a segunda sobrescreve
   * a primeira — deixando o custo do insumo simplesmente errado, sem erro
   * nenhum aparecer.
   */
  await stockRepository.ensureStockItem(tx, tenantId, 'supply', input.supplyId);
  const locked = await stockRepository.lockStockItem(tx, 'supply', input.supplyId);
  if (!locked) throw new Error('Saldo do insumo não encontrado após criação.');

  const avgUnitCostAfter = weightedAverageUnitCost({
    currentQty: locked.qtyOnHand,
    currentUnitCost: supply.avgUnitCost,
    incomingQty: usageQty,
    incomingUnitCost: unitCost,
  });

  const purchase = await repository.insertPurchase(tx, {
    tenantId,
    supplyId: input.supplyId,
    supplierId: input.supplierId ?? null,
    purchaseQty: input.purchaseQty,
    purchaseUnit: input.purchaseUnit,
    conversionFactor,
    totalCents: input.totalCents,
    unitCost,
    purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(),
    invoiceRef: input.invoiceRef ?? null,
    note: input.note ?? null,
  });

  await repository.updateSupply(tx, input.supplyId, { avgUnitCost: avgUnitCostAfter });

  await applyMovements(
    tx,
    tenantId,
    [
      {
        kind: 'supply',
        refId: input.supplyId,
        type: 'purchase',
        qty: usageQty,
        unitCost,
      },
    ],
    { source: 'supply_purchase', sourceId: purchase.id },
  );

  await recordAudit(tx, {
    tenantId,
    action: 'supply.purchased',
    entityType: 'supply',
    entityId: input.supplyId,
    before: { avgUnitCost: supply.avgUnitCost, qtyOnHand: locked.qtyOnHand },
    after: {
      purchaseId: purchase.id,
      totalCents: input.totalCents,
      usageQty,
      unitCost,
      avgUnitCost: avgUnitCostAfter,
    },
  });

  /**
   * A compra vira despesa no mesmo instante.
   *
   * Marcada como paga porque o cadastro de compra não tem prazo: quem registra
   * está lançando algo que já comprou. Compra a prazo se lança como despesa
   * manual com vencimento futuro, até existir campo de condição de pagamento.
   */
  await financeService.recordAutoEntry(tx, tenantId, {
    source: 'supply_purchase',
    sourceId: purchase.id,
    direction: 'out',
    description: `Compra: ${supply.name}`,
    amountCents: input.totalCents,
    dueDate: purchase.purchasedAt.toISOString().slice(0, 10),
    categoryName: 'Insumos',
    paid: true,
  });

  return toPurchase(
    {
      ...purchase,
      supplyName: supply.name,
      supplierName: null,
    },
    avgUnitCostAfter,
  );
}
