import {
  productVariants,
  products,
  stockItems,
  stockMovements,
  supplies,
  type Executor,
} from '@cantina/db';
import { and, desc, eq, gte, ilike, isNull, lt, lte, sql } from 'drizzle-orm';

/**
 * Estoque como livro-razão (§4.6 do PLAN.md, invariante 3).
 *
 * `stock_items` e `stock_movements` são polimórficas (`kind` + `ref_id`):
 * produto e insumo se movimentam pelas mesmas regras, e duplicar as tabelas
 * duplicaria a lógica de reserva — a parte mais fácil de errar. O preço é não
 * ter FK; a integridade é garantida no serviço, que valida o `ref_id` antes
 * de qualquer movimento.
 */

export type StockItemRow = typeof stockItems.$inferSelect;
export type MovementRow = typeof stockMovements.$inferSelect;
export type StockKind = 'product_variant' | 'supply';

/**
 * Cria a linha de saldo se ainda não existir.
 *
 * O saldo nasce no PRIMEIRO movimento — catálogo e cadastro de insumo não
 * escrevem aqui (dois donos para o mesmo dado é como divergência começa).
 * `onConflictDoNothing` em vez de checar antes: duas requisições concorrentes
 * para a mesma variação chegariam juntas na checagem e ambas tentariam
 * inserir.
 */
export async function ensureStockItem(
  tx: Executor,
  tenantId: string,
  kind: StockKind,
  refId: string,
): Promise<void> {
  await tx
    .insert(stockItems)
    .values({ tenantId, kind, refId, qtyOnHand: 0, qtyReserved: 0 })
    .onConflictDoNothing({
      target: [stockItems.tenantId, stockItems.kind, stockItems.refId],
    });
}

/**
 * Trava a linha de saldo até o fim da transação.
 *
 * Sem o `FOR UPDATE`, dois pedidos simultâneos leem o mesmo saldo, cada um
 * conclui que há estoque, e os dois reservam — vendendo o que não existe.
 */
export async function lockStockItem(
  tx: Executor,
  kind: StockKind,
  refId: string,
): Promise<StockItemRow | null> {
  const rows = await tx
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.kind, kind), eq(stockItems.refId, refId)))
    .limit(1)
    .for('update');

  return rows[0] ?? null;
}

export async function updateBalance(
  tx: Executor,
  stockItemId: string,
  balance: { qtyOnHand: number; qtyReserved: number },
): Promise<void> {
  await tx
    .update(stockItems)
    .set({ qtyOnHand: balance.qtyOnHand, qtyReserved: balance.qtyReserved })
    .where(eq(stockItems.id, stockItemId));
}

export async function insertMovement(
  tx: Executor,
  values: typeof stockMovements.$inferInsert,
): Promise<MovementRow> {
  const rows = await tx.insert(stockMovements).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao gravar o movimento de estoque.');
  return created;
}

/* -------------------------------------------------------------------------- */
/* Saldos                                                                      */
/* -------------------------------------------------------------------------- */

export interface BalanceRow {
  refId: string;
  refName: string;
  unit: string;
  qtyOnHand: number;
  qtyReserved: number;
  minStockQty: number | null;
  updatedAt: Date;
}

export interface ListBalancesFilters {
  cursor?: string | undefined;
  limit: number;
  lowOnly?: boolean | undefined;
  q?: string | undefined;
}

export async function listSupplyBalances(
  tx: Executor,
  filters: ListBalancesFilters,
): Promise<BalanceRow[]> {
  const where = [eq(stockItems.kind, 'supply'), isNull(supplies.deletedAt)];
  if (filters.cursor) where.push(lt(stockItems.refId, filters.cursor));
  if (filters.q) where.push(ilike(supplies.name, `%${filters.q}%`));
  if (filters.lowOnly) {
    where.push(lte(stockItems.qtyOnHand, supplies.minStockQty));
  }

  return tx
    .select({
      refId: stockItems.refId,
      refName: supplies.name,
      unit: supplies.usageUnit,
      qtyOnHand: stockItems.qtyOnHand,
      qtyReserved: stockItems.qtyReserved,
      minStockQty: supplies.minStockQty,
      updatedAt: stockItems.updatedAt,
    })
    .from(stockItems)
    .innerJoin(supplies, eq(stockItems.refId, supplies.id))
    .where(and(...where))
    .orderBy(desc(stockItems.refId))
    .limit(filters.limit);
}

export async function listVariantBalances(
  tx: Executor,
  filters: ListBalancesFilters,
): Promise<BalanceRow[]> {
  const where = [eq(stockItems.kind, 'product_variant'), isNull(productVariants.deletedAt)];
  if (filters.cursor) where.push(lt(stockItems.refId, filters.cursor));
  if (filters.q) where.push(ilike(products.name, `%${filters.q}%`));

  return tx
    .select({
      refId: stockItems.refId,
      refName: sql<string>`${products.name} || ' (' || ${productVariants.name} || ')'`,
      unit: sql<string>`'un'`,
      qtyOnHand: stockItems.qtyOnHand,
      qtyReserved: stockItems.qtyReserved,
      minStockQty: sql<number | null>`null::numeric`,
      updatedAt: stockItems.updatedAt,
    })
    .from(stockItems)
    .innerJoin(productVariants, eq(stockItems.refId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(...where))
    .orderBy(desc(stockItems.refId))
    .limit(filters.limit);
}

/** Saldo de um item específico, sem travar. Para leitura. */
export async function findBalance(
  tx: Executor,
  kind: StockKind,
  refId: string,
): Promise<{ qtyOnHand: number; qtyReserved: number } | null> {
  const rows = await tx
    .select({ qtyOnHand: stockItems.qtyOnHand, qtyReserved: stockItems.qtyReserved })
    .from(stockItems)
    .where(and(eq(stockItems.kind, kind), eq(stockItems.refId, refId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Quanto um documento movimentou, agregado por item.
 *
 * É o que permite desfazer um pedido usando EXATAMENTE as quantidades que
 * foram reservadas, e não as que a receita diria hoje. Sem isto, uma ficha
 * técnica editada entre a reserva e o cancelamento devolveria uma quantidade
 * diferente da que saiu — e o saldo passaria a mentir sem nenhum erro.
 */
export async function sumMovementsBySource(
  tx: Executor,
  source: MovementRow['source'],
  sourceId: string,
  type: MovementRow['type'],
): Promise<Array<{ kind: StockKind; refId: string; qty: number }>> {
  const rows = await tx
    .select({
      kind: stockMovements.kind,
      refId: stockMovements.refId,
      qty: sql<number>`sum(${stockMovements.qtyDelta})`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.source, source),
        eq(stockMovements.sourceId, sourceId),
        eq(stockMovements.type, type),
      ),
    )
    .groupBy(stockMovements.kind, stockMovements.refId);

  return rows
    .map((row) => ({ kind: row.kind, refId: row.refId, qty: Number(row.qty) }))
    .filter((row) => row.qty > 0);
}

/* -------------------------------------------------------------------------- */
/* Extrato                                                                     */
/* -------------------------------------------------------------------------- */

export interface MovementListRow {
  id: string;
  kind: StockKind;
  refId: string;
  refName: string | null;
  type: MovementRow['type'];
  qtyDelta: number;
  balanceAfter: number;
  unitCost: number | null;
  reason: string | null;
  source: MovementRow['source'];
  sourceId: string | null;
  createdAt: Date;
}

export interface ListMovementsFilters {
  cursor?: string | undefined;
  limit: number;
  kind?: StockKind | undefined;
  refId?: string | undefined;
  type?: MovementRow['type'] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

/**
 * Extrato com o nome do item resolvido na própria consulta.
 *
 * Os dois `leftJoin` são condicionados ao `kind`, então cada linha casa com
 * exatamente uma das tabelas — é o preço de ter uma tabela polimórfica, pago
 * numa consulta só em vez de num N+1 na tela.
 */
export async function listMovements(
  tx: Executor,
  filters: ListMovementsFilters,
): Promise<MovementListRow[]> {
  const where = [];
  if (filters.cursor) where.push(lt(stockMovements.id, filters.cursor));
  if (filters.kind) where.push(eq(stockMovements.kind, filters.kind));
  if (filters.refId) where.push(eq(stockMovements.refId, filters.refId));
  if (filters.type) where.push(eq(stockMovements.type, filters.type));
  if (filters.from) where.push(gte(stockMovements.createdAt, filters.from));
  if (filters.to) where.push(lte(stockMovements.createdAt, filters.to));

  return tx
    .select({
      id: stockMovements.id,
      kind: stockMovements.kind,
      refId: stockMovements.refId,
      refName: sql<string | null>`coalesce(
        ${supplies.name},
        ${products.name} || ' (' || ${productVariants.name} || ')'
      )`,
      type: stockMovements.type,
      qtyDelta: stockMovements.qtyDelta,
      balanceAfter: stockMovements.balanceAfter,
      unitCost: stockMovements.unitCost,
      reason: stockMovements.reason,
      source: stockMovements.source,
      sourceId: stockMovements.sourceId,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .leftJoin(
      supplies,
      and(eq(stockMovements.kind, 'supply'), eq(stockMovements.refId, supplies.id)),
    )
    .leftJoin(
      productVariants,
      and(
        eq(stockMovements.kind, 'product_variant'),
        eq(stockMovements.refId, productVariants.id),
      ),
    )
    .leftJoin(products, eq(productVariants.productId, products.id))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(stockMovements.id))
    .limit(filters.limit);
}
