import {
  deliveryOrderItems,
  deliveryOrders,
  financeEntries,
  ordersUnified,
  preorderItems,
  preorders,
  salesChannels,
  stockMovements,
  supplies,
  supplyPurchases,
  type Executor,
} from '@cantina/db';
import { and, eq, gte, inArray, isNull, lt, sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Consultas de relatório (módulo 10).
 *
 * Tudo que envolve venda lê de `v_orders_unified`: delivery e encomenda no
 * mesmo cálculo, sem duas fórmulas de faturamento (§4.11).
 *
 * Duas decisões atravessam o arquivo inteiro:
 *
 *   1. O recorte é por `completed_at`. Faturamento é o que foi ENTREGUE no
 *      período, não o que foi pedido — um pedido feito dia 31 e entregue dia
 *      1º pertence ao mês seguinte.
 *   2. O intervalo chega como dois INSTANTES já convertidos do fuso da loja
 *      (`zonedStartOfDay`), e a comparação é meio-aberta `[início, fim)`.
 *      Converter cada linha com `at time zone` daria o mesmo resultado e
 *      inutilizaria os índices de `completed_at`.
 */

export interface Range {
  /** Instante em que o primeiro dia começa, no fuso da loja. */
  start: Date;
  /** Instante em que o dia seguinte ao último começa. Exclusivo. */
  end: Date;
  timeZone: string;
}

function within(column: SQLWrapper, range: Range) {
  return and(gte(column, range.start), lt(column, range.end));
}

/** Data de calendário da loja, para agrupar por dia sem escorregar de fuso. */
function localDate(column: SQLWrapper, timeZone: string): SQL<string> {
  return sql<string>`((${column} at time zone ${timeZone})::date)::text`;
}

/* -------------------------------------------------------------------------- */
/* Resumo                                                                      */
/* -------------------------------------------------------------------------- */

export interface SummaryRow {
  revenueCents: number;
  costCents: number;
  ordersCount: number;
  deliveryCount: number;
  preorderCount: number;
  receivableCents: number;
}

export async function summary(tx: Executor, range: Range): Promise<SummaryRow> {
  const rows = await tx
    .select({
      revenueCents: sql<number>`coalesce(sum(${ordersUnified.totalCents}), 0)`,
      costCents: sql<number>`coalesce(sum(${ordersUnified.costCents}), 0)`,
      ordersCount: sql<number>`count(*)`,
      deliveryCount: sql<number>`count(*) filter (where ${ordersUnified.kind} = 'delivery')`,
      preorderCount: sql<number>`count(*) filter (where ${ordersUnified.kind} = 'preorder')`,
      // O que já foi entregue mas ainda não foi pago — o número que some de
      // um relatório de caixa e reaparece como surpresa no fim do mês.
      receivableCents: sql<number>`coalesce(sum(${ordersUnified.totalCents}) filter (where ${ordersUnified.paymentStatus} <> 'paid'), 0)`,
    })
    .from(ordersUnified)
    .where(within(ordersUnified.completedAt, range));

  const row = rows[0];
  return {
    revenueCents: Number(row?.revenueCents ?? 0),
    costCents: Number(row?.costCents ?? 0),
    ordersCount: Number(row?.ordersCount ?? 0),
    deliveryCount: Number(row?.deliveryCount ?? 0),
    preorderCount: Number(row?.preorderCount ?? 0),
    receivableCents: Number(row?.receivableCents ?? 0),
  };
}

export async function canceledCount(tx: Executor, range: Range): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)` })
    .from(ordersUnified)
    .where(within(ordersUnified.canceledAt, range));

  return Number(rows[0]?.total ?? 0);
}

/**
 * Despesas pagas no período, separadas por origem.
 *
 * `supply_purchase` sai do bolo de despesas operacionais de propósito:
 * comprar insumo é estoque, e ele vira custo quando o produto é vendido.
 * Somar os dois contaria a farinha duas vezes.
 */
export async function expenses(
  tx: Executor,
  range: Range,
): Promise<{ operatingCents: number; supplyPurchasesCents: number }> {
  const paid = sql`coalesce(nullif(${financeEntries.paidAmountCents}, 0), ${financeEntries.amountCents})`;

  const rows = await tx
    .select({
      operatingCents: sql<number>`coalesce(sum(${paid}) filter (where ${financeEntries.source} <> 'supply_purchase'), 0)`,
      supplyPurchasesCents: sql<number>`coalesce(sum(${paid}) filter (where ${financeEntries.source} = 'supply_purchase'), 0)`,
    })
    .from(financeEntries)
    .where(
      and(
        isNull(financeEntries.deletedAt),
        // Cancelado com data de pagamento existe: baixa lançada e depois
        // desfeita. O dinheiro voltou, e o relatório precisa concordar.
        sql`${financeEntries.status} <> 'canceled'`,
        eq(financeEntries.direction, 'out'),
        within(financeEntries.paidAt, range),
      ),
    );

  return {
    operatingCents: Number(rows[0]?.operatingCents ?? 0),
    supplyPurchasesCents: Number(rows[0]?.supplyPurchasesCents ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Vendas agrupadas                                                            */
/* -------------------------------------------------------------------------- */

export interface SalesGroupRow {
  key: string;
  ordersCount: number;
  revenueCents: number;
  costCents: number;
}

export type SalesGroupBy = 'day' | 'channel' | 'payment_method' | 'origin' | 'kind';

function groupColumn(groupBy: SalesGroupBy, timeZone: string): SQL<string> {
  switch (groupBy) {
    case 'day':
      return localDate(ordersUnified.completedAt, timeZone);
    case 'channel':
      // Venda no balcão não tem canal; sem o `coalesce` ela sumiria do
      // agrupamento e o total das linhas não bateria com o faturamento.
      return sql<string>`coalesce(${ordersUnified.salesChannelId}::text, '')`;
    case 'payment_method':
      return sql<string>`coalesce(${ordersUnified.paymentMethod}, '')`;
    case 'origin':
      return sql<string>`${ordersUnified.origin}`;
    case 'kind':
      return sql<string>`${ordersUnified.kind}`;
  }
}

export async function salesGrouped(
  tx: Executor,
  range: Range,
  groupBy: SalesGroupBy,
): Promise<SalesGroupRow[]> {
  const column = groupColumn(groupBy, range.timeZone);
  const revenue = sql<number>`coalesce(sum(${ordersUnified.totalCents}), 0)`;

  const rows = await tx
    .select({
      key: column,
      ordersCount: sql<number>`count(*)`,
      revenueCents: revenue,
      costCents: sql<number>`coalesce(sum(${ordersUnified.costCents}), 0)`,
    })
    .from(ordersUnified)
    .where(within(ordersUnified.completedAt, range))
    // Por POSIÇÃO da coluna no select, não repetindo a expressão de `column`.
    // No caso 'day', `column` embute o parâmetro `timeZone` — cada vez que o
    // mesmo fragmento SQL é interpolado de novo (aqui e no order by), o
    // Postgres gera um `$N` diferente para ele, mesmo com o mesmo valor. Pra
    // validar o GROUP BY ele compara a árvore da expressão do select com a
    // do group by, e `$1 ≠ $4` mesmo ligados ao mesmo argumento — a query
    // quebra com "must appear in the GROUP BY clause". Por posição (1 = key),
    // o problema não existe.
    .groupBy(sql`1`)
    // Série temporal se lê em ordem cronológica; ranking, do maior para o
    // menor (3 = revenueCents).
    .orderBy(groupBy === 'day' ? sql`1 asc` : sql`3 desc`);

  return rows.map((row) => ({
    key: String(row.key ?? ''),
    ordersCount: Number(row.ordersCount),
    revenueCents: Number(row.revenueCents),
    costCents: Number(row.costCents),
  }));
}

export async function channelNames(tx: Executor): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: salesChannels.id, name: salesChannels.name })
    .from(salesChannels);

  return new Map(rows.map((row) => [row.id, row.name]));
}

/* -------------------------------------------------------------------------- */
/* Produtos                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProductRow {
  productVariantId: string | null;
  productName: string;
  variantName: string | null;
  qty: number;
  revenueCents: number;
  costCents: number;
}

/**
 * Itens vendidos, somando os dois agregados.
 *
 * `v_orders_unified` agrega PEDIDOS, não itens, então aqui são duas consultas
 * simétricas fundidas em memória. É de propósito: uma view de itens seria um
 * segundo objeto de banco a manter em sincronia com dois schemas, e o número
 * de variações vendidas num mês cabe folgado num `Map`.
 *
 * A chave da fusão é `product_variant_id`; quando ele é nulo — variação
 * excluída depois da venda — o nome congelado no item vira a chave, senão
 * todos os produtos apagados virariam uma linha só.
 */
export async function productsSold(tx: Executor, range: Range): Promise<ProductRow[]> {
  const [delivery, preorder] = await Promise.all([
    tx
      .select({
        productVariantId: deliveryOrderItems.productVariantId,
        productName: deliveryOrderItems.productNameSnapshot,
        variantName: deliveryOrderItems.variantNameSnapshot,
        qty: sql<number>`sum(${deliveryOrderItems.qty})`,
        revenueCents: sql<number>`sum(${deliveryOrderItems.totalCents})`,
        costCents: sql<number>`sum(${deliveryOrderItems.unitCostCents} * ${deliveryOrderItems.qty})`,
      })
      .from(deliveryOrderItems)
      .innerJoin(deliveryOrders, eq(deliveryOrders.id, deliveryOrderItems.orderId))
      .where(within(deliveryOrders.completedAt, range))
      .groupBy(
        deliveryOrderItems.productVariantId,
        deliveryOrderItems.productNameSnapshot,
        deliveryOrderItems.variantNameSnapshot,
      ),

    tx
      .select({
        productVariantId: preorderItems.productVariantId,
        productName: preorderItems.productNameSnapshot,
        variantName: preorderItems.variantNameSnapshot,
        qty: sql<number>`sum(${preorderItems.qty})`,
        revenueCents: sql<number>`sum(${preorderItems.totalCents})`,
        costCents: sql<number>`sum(${preorderItems.unitCostCents} * ${preorderItems.qty})`,
      })
      .from(preorderItems)
      .innerJoin(preorders, eq(preorders.id, preorderItems.preorderId))
      .where(within(preorders.completedAt, range))
      .groupBy(
        preorderItems.productVariantId,
        preorderItems.productNameSnapshot,
        preorderItems.variantNameSnapshot,
      ),
  ]);

  const merged = new Map<string, ProductRow>();

  for (const row of [...delivery, ...preorder]) {
    const key = row.productVariantId ?? `~${row.productName}|${row.variantName ?? ''}`;
    const current = merged.get(key);

    if (current) {
      current.qty += Number(row.qty);
      current.revenueCents += Number(row.revenueCents);
      current.costCents += Number(row.costCents);
      continue;
    }

    merged.set(key, {
      productVariantId: row.productVariantId,
      productName: row.productName,
      variantName: row.variantName,
      qty: Number(row.qty),
      revenueCents: Number(row.revenueCents),
      costCents: Number(row.costCents),
    });
  }

  return [...merged.values()];
}

/* -------------------------------------------------------------------------- */
/* Custos e consumo de insumo                                                  */
/* -------------------------------------------------------------------------- */

export interface SupplyUsageRow {
  supplyId: string;
  supplyName: string;
  unit: string;
  consumedQty: number;
  lostQty: number;
  avgUnitCost: number;
}

/**
 * Consumo por insumo, lido do livro-razão.
 *
 * Saída por venda ou produção é consumo; perda é desperdício. Somar as duas
 * esconderia justamente o número sobre o qual dá para agir — e `qty_delta` é
 * sempre positiva nesses três tipos, então a soma já sai no sinal certo.
 */
export async function supplyUsage(tx: Executor, range: Range): Promise<SupplyUsageRow[]> {
  const consumed = sql<number>`coalesce(sum(${stockMovements.qtyDelta}) filter (where ${stockMovements.type} in ('sale', 'production_out')), 0)`;

  const rows = await tx
    .select({
      supplyId: supplies.id,
      supplyName: supplies.name,
      unit: supplies.usageUnit,
      avgUnitCost: supplies.avgUnitCost,
      consumedQty: consumed,
      lostQty: sql<number>`coalesce(sum(${stockMovements.qtyDelta}) filter (where ${stockMovements.type} = 'loss'), 0)`,
    })
    .from(stockMovements)
    .innerJoin(supplies, eq(supplies.id, stockMovements.refId))
    .where(
      and(eq(stockMovements.kind, 'supply'), within(stockMovements.createdAt, range)),
    )
    .groupBy(supplies.id, supplies.name, supplies.usageUnit, supplies.avgUnitCost)
    .orderBy(sql`${consumed} desc`);

  return rows.map((row) => ({
    supplyId: row.supplyId,
    supplyName: row.supplyName,
    unit: row.unit,
    consumedQty: Number(row.consumedQty),
    lostQty: Number(row.lostQty),
    avgUnitCost: Number(row.avgUnitCost),
  }));
}

export interface PurchaseRow {
  qty: number;
  cents: number;
}

/** Compras do período, na unidade de USO — `purchaseQty` está na de compra. */
export async function purchasesBySupply(
  tx: Executor,
  range: Range,
): Promise<Map<string, PurchaseRow>> {
  const rows = await tx
    .select({
      supplyId: supplyPurchases.supplyId,
      qty: sql<number>`coalesce(sum(${supplyPurchases.purchaseQty} * ${supplyPurchases.conversionFactor}), 0)`,
      cents: sql<number>`coalesce(sum(${supplyPurchases.totalCents}), 0)`,
    })
    .from(supplyPurchases)
    .where(within(supplyPurchases.purchasedAt, range))
    .groupBy(supplyPurchases.supplyId);

  return new Map(
    rows.map((row) => [row.supplyId, { qty: Number(row.qty), cents: Number(row.cents) }]),
  );
}

/** Nome e unidade de insumos que apareceram só nas compras do período. */
export async function supplyNames(
  tx: Executor,
  ids: readonly string[],
): Promise<Map<string, { name: string; unit: string; avgUnitCost: number }>> {
  if (ids.length === 0) return new Map();

  const rows = await tx
    .select({
      id: supplies.id,
      name: supplies.name,
      unit: supplies.usageUnit,
      avgUnitCost: supplies.avgUnitCost,
    })
    .from(supplies)
    .where(inArray(supplies.id, [...ids]));

  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.name, unit: row.unit, avgUnitCost: Number(row.avgUnitCost) },
    ]),
  );
}
