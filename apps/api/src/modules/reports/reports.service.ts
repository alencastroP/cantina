import type {
  CostsReport,
  ProductsReport,
  ReportSummary,
  SalesGroupBy,
  SalesReport,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  daysBetween,
  domainError,
  roundCents,
  unitCostToCents,
  zonedEndOfDay,
  zonedStartOfDay,
  type DateOnly,
} from '@cantina/domain';

import * as repository from './reports.repository';

/**
 * Relatórios (§6.9 do PLAN.md, módulo 10).
 *
 * A camada existe para uma coisa só: transformar somas do banco nos números
 * que o lojista de fato lê — margem, ticket, participação — num lugar único.
 * Espalhar essas contas pela tela é como um sistema passa a ter duas margens
 * diferentes na mesma página.
 */

/** Um ano de janela. Além disso a agregação por dia deixa de caber num gráfico. */
const MAX_RANGE_DAYS = 366;

export interface ReportRange {
  from: DateOnly;
  to: DateOnly;
}

function resolveRange(range: ReportRange, timeZone: string): repository.Range {
  const span = daysBetween(range.from, range.to);

  if (span < 0) {
    throw domainError('invalid_range', 'A data inicial precisa ser anterior à final.', {
      ...range,
    });
  }
  if (span > MAX_RANGE_DAYS) {
    throw domainError(
      'range_too_large',
      `O período não pode passar de ${MAX_RANGE_DAYS} dias.`,
      { ...range },
    );
  }

  return {
    start: zonedStartOfDay(range.from, timeZone),
    end: zonedEndOfDay(range.to, timeZone),
    timeZone,
  };
}

/** Margem percentual sobre a receita. Sem receita não há percentual — zero. */
export function marginPercent(revenueCents: number, costCents: number): number {
  if (revenueCents === 0) return 0;
  return Math.round(((revenueCents - costCents) / revenueCents) * 1000) / 10;
}

/* -------------------------------------------------------------------------- */
/* Resumo                                                                      */
/* -------------------------------------------------------------------------- */

export async function summary(
  tx: Transaction,
  range: ReportRange,
  timeZone: string,
): Promise<ReportSummary> {
  const resolved = resolveRange(range, timeZone);

  const [sales, canceled, paid] = await Promise.all([
    repository.summary(tx, resolved),
    repository.canceledCount(tx, resolved),
    repository.expenses(tx, resolved),
  ]);

  return composeSummary(range, sales, canceled, paid);
}

/**
 * A aritmética do resumo, separada do banco para poder ser verificada.
 *
 * O que ela protege é a regra de não contar a farinha duas vezes: compra de
 * insumo entra no relatório como informação de caixa, nunca no resultado.
 */
export function composeSummary(
  range: ReportRange,
  sales: repository.SummaryRow,
  canceled: number,
  paid: { operatingCents: number; supplyPurchasesCents: number },
): ReportSummary {
  const costOfGoodsCents = roundCents(sales.costCents);
  const grossMarginCents = sales.revenueCents - costOfGoodsCents;

  return {
    from: range.from,
    to: range.to,

    revenueCents: sales.revenueCents,
    ordersCount: sales.ordersCount,
    avgTicketCents:
      sales.ordersCount === 0 ? 0 : roundCents(sales.revenueCents / sales.ordersCount),

    deliveryCount: sales.deliveryCount,
    preorderCount: sales.preorderCount,
    canceledCount: canceled,

    costOfGoodsCents,
    grossMarginCents,
    grossMarginPercent: marginPercent(sales.revenueCents, costOfGoodsCents),

    operatingExpensesCents: paid.operatingCents,
    supplyPurchasesCents: paid.supplyPurchasesCents,

    // Compra de insumo NÃO entra aqui: é troca de dinheiro por estoque, e o
    // custo dela já aparece em `costOfGoodsCents` quando o produto sai.
    resultCents: grossMarginCents - paid.operatingCents,

    receivableCents: sales.receivableCents,
  };
}

/* -------------------------------------------------------------------------- */
/* Vendas                                                                      */
/* -------------------------------------------------------------------------- */

const ORIGIN_LABELS: Record<string, string> = {
  storefront_checkout: 'Loja online',
  storefront_whatsapp: 'WhatsApp',
  manual: 'Balcão',
  imported: 'Importado',
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  meal_voucher: 'Vale-refeição',
  bank_transfer: 'Transferência',
  other: 'Outro',
};

const KIND_LABELS: Record<string, string> = {
  delivery: 'Pedido do dia',
  preorder: 'Encomenda',
};

/**
 * Rótulo legível de cada agrupamento.
 *
 * O canal é o motivo de isto viver no servidor: só aqui existe o nome por
 * trás do UUID, e resolver na tela custaria uma segunda requisição. Já o
 * agrupamento por dia devolve a data ISO como rótulo de propósito — quem
 * desenha o gráfico precisa dela ordenável, e formata no idioma do usuário.
 */
function labelFor(
  groupBy: SalesGroupBy,
  key: string,
  channels: Map<string, string>,
): string {
  switch (groupBy) {
    case 'day':
      return key;
    case 'channel':
      return key === '' ? 'Venda direta' : (channels.get(key) ?? 'Canal removido');
    case 'payment_method':
      return key === '' ? 'Não informado' : (PAYMENT_LABELS[key] ?? key);
    case 'origin':
      return ORIGIN_LABELS[key] ?? key;
    case 'kind':
      return KIND_LABELS[key] ?? key;
  }
}

export async function sales(
  tx: Transaction,
  range: ReportRange,
  groupBy: SalesGroupBy,
  timeZone: string,
): Promise<SalesReport> {
  const resolved = resolveRange(range, timeZone);

  const rows = await repository.salesGrouped(tx, resolved, groupBy);
  const channels = groupBy === 'channel' ? await repository.channelNames(tx) : new Map();

  return {
    groupBy,
    rows: rows.map((row) => {
      const costCents = roundCents(row.costCents);
      return {
        key: row.key,
        label: labelFor(groupBy, row.key, channels),
        ordersCount: row.ordersCount,
        revenueCents: row.revenueCents,
        costCents,
        marginCents: row.revenueCents - costCents,
        marginPercent: marginPercent(row.revenueCents, costCents),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Produtos                                                                    */
/* -------------------------------------------------------------------------- */

export async function products(
  tx: Transaction,
  range: ReportRange,
  orderBy: 'revenue' | 'qty' | 'margin',
  limit: number,
  timeZone: string,
): Promise<ProductsReport> {
  const resolved = resolveRange(range, timeZone);
  const rows = await repository.productsSold(tx, resolved);

  const enriched = rows.map((row) => {
    const costCents = roundCents(row.costCents);
    return {
      productVariantId: row.productVariantId,
      productName: row.productName,
      variantName: row.variantName,
      qty: row.qty,
      revenueCents: row.revenueCents,
      costCents,
      marginCents: row.revenueCents - costCents,
      marginPercent: marginPercent(row.revenueCents, costCents),
      revenueSharePercent: 0,
    };
  });

  // A participação é sobre o faturamento de ITENS do período, não sobre o do
  // resumo: aquele inclui taxa de entrega e desconto no pedido, e as fatias
  // não fechariam 100%.
  const totalRevenueCents = enriched.reduce((total, row) => total + row.revenueCents, 0);

  for (const row of enriched) {
    row.revenueSharePercent =
      totalRevenueCents === 0
        ? 0
        : Math.round((row.revenueCents / totalRevenueCents) * 1000) / 10;
  }

  const compare = {
    revenue: (a: (typeof enriched)[number], b: (typeof enriched)[number]) =>
      b.revenueCents - a.revenueCents,
    qty: (a: (typeof enriched)[number], b: (typeof enriched)[number]) => b.qty - a.qty,
    margin: (a: (typeof enriched)[number], b: (typeof enriched)[number]) =>
      b.marginCents - a.marginCents,
  }[orderBy];

  return {
    rows: enriched.sort(compare).slice(0, limit),
    totalRevenueCents,
  };
}

/* -------------------------------------------------------------------------- */
/* Custos                                                                      */
/* -------------------------------------------------------------------------- */

export async function costs(
  tx: Transaction,
  range: ReportRange,
  timeZone: string,
): Promise<CostsReport> {
  const resolved = resolveRange(range, timeZone);

  const [usage, purchases] = await Promise.all([
    repository.supplyUsage(tx, resolved),
    repository.purchasesBySupply(tx, resolved),
  ]);

  // Um insumo comprado e ainda não usado não aparece no consumo, mas o
  // dinheiro dele saiu — então as duas listas se somam, não se filtram.
  const ids = new Set([...usage.map((row) => row.supplyId), ...purchases.keys()]);
  const byId = new Map(usage.map((row) => [row.supplyId, row]));

  let totalPurchasedCents = 0;
  let totalLossCents = 0;

  const rows = [...ids].map((supplyId) => {
    const used = byId.get(supplyId);
    const bought = purchases.get(supplyId) ?? { qty: 0, cents: 0 };
    const avgUnitCost = used?.avgUnitCost ?? 0;
    const lostQty = used?.lostQty ?? 0;

    totalPurchasedCents += bought.cents;
    totalLossCents += unitCostToCents(avgUnitCost, lostQty);

    return {
      supplyId,
      supplyName: used?.supplyName ?? '',
      unit: used?.unit ?? 'un',
      consumedQty: used?.consumedQty ?? 0,
      lostQty,
      purchasedQty: bought.qty,
      purchasedCents: bought.cents,
      avgUnitCost,
    };
  });

  // Um insumo que só teve compra no período chega sem nome (a soma de consumo
  // é quem trazia o `join` com `supplies`); completar aqui evita uma segunda
  // consulta só para nomear duas ou três linhas.
  const missing = rows.filter((row) => row.supplyName === '').map((row) => row.supplyId);
  if (missing.length > 0) {
    const names = await repository.supplyNames(tx, missing);
    for (const row of rows) {
      if (row.supplyName === '') {
        const found = names.get(row.supplyId);
        row.supplyName = found?.name ?? 'Insumo removido';
        row.unit = found?.unit ?? row.unit;
        row.avgUnitCost = found?.avgUnitCost ?? row.avgUnitCost;
      }
    }
  }

  return {
    rows: rows.sort((a, b) => b.purchasedCents - a.purchasedCents),
    totalPurchasedCents,
    totalLossCents,
  };
}
