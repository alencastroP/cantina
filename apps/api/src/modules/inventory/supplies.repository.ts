import {
  recipeItems,
  stockItems,
  supplies,
  supplyPurchases,
  suppliers,
  type Executor,
} from '@cantina/db';
import { and, asc, count, desc, eq, gte, ilike, isNull, lt, lte, sql } from 'drizzle-orm';

/** Insumos, fornecedores e compras (§4.5 do PLAN.md). */

export type SupplyRow = typeof supplies.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;
export type PurchaseRow = typeof supplyPurchases.$inferSelect;

export interface SupplyWithBalance extends SupplyRow {
  qtyOnHand: number;
  qtyReserved: number;
}

const supplyWithBalanceColumns = {
  id: supplies.id,
  tenantId: supplies.tenantId,
  name: supplies.name,
  type: supplies.type,
  usageUnit: supplies.usageUnit,
  avgUnitCost: supplies.avgUnitCost,
  minStockQty: supplies.minStockQty,
  active: supplies.active,
  createdAt: supplies.createdAt,
  updatedAt: supplies.updatedAt,
  deletedAt: supplies.deletedAt,
  // Insumo recém-criado ainda não tem linha de saldo: ela nasce no primeiro
  // movimento, então o `coalesce` cobre o intervalo entre cadastro e compra.
  qtyOnHand: sql<number>`coalesce(${stockItems.qtyOnHand}, 0)`,
  qtyReserved: sql<number>`coalesce(${stockItems.qtyReserved}, 0)`,
};

export interface ListSuppliesFilters {
  cursor?: string | undefined;
  limit: number;
  type?: 'ingredient' | 'packaging' | undefined;
  active?: boolean | undefined;
  lowOnly?: boolean | undefined;
  q?: string | undefined;
}

export async function listSupplies(
  tx: Executor,
  filters: ListSuppliesFilters,
): Promise<SupplyWithBalance[]> {
  const where = [isNull(supplies.deletedAt)];
  if (filters.cursor) where.push(lt(supplies.id, filters.cursor));
  if (filters.type) where.push(eq(supplies.type, filters.type));
  if (filters.active !== undefined) where.push(eq(supplies.active, filters.active));
  if (filters.q) where.push(ilike(supplies.name, `%${filters.q}%`));
  if (filters.lowOnly) {
    where.push(lte(sql`coalesce(${stockItems.qtyOnHand}, 0)`, supplies.minStockQty));
  }

  return tx
    .select(supplyWithBalanceColumns)
    .from(supplies)
    .leftJoin(
      stockItems,
      and(eq(stockItems.kind, 'supply'), eq(stockItems.refId, supplies.id)),
    )
    .where(and(...where))
    .orderBy(desc(supplies.id))
    .limit(filters.limit);
}

export async function findSupplyById(
  tx: Executor,
  supplyId: string,
): Promise<SupplyWithBalance | null> {
  const rows = await tx
    .select(supplyWithBalanceColumns)
    .from(supplies)
    .leftJoin(
      stockItems,
      and(eq(stockItems.kind, 'supply'), eq(stockItems.refId, supplies.id)),
    )
    .where(and(eq(supplies.id, supplyId), isNull(supplies.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertSupply(
  tx: Executor,
  values: typeof supplies.$inferInsert,
): Promise<SupplyRow> {
  const rows = await tx.insert(supplies).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o insumo.');
  return created;
}

export async function updateSupply(
  tx: Executor,
  supplyId: string,
  patch: Partial<typeof supplies.$inferInsert>,
): Promise<SupplyRow | null> {
  const rows = await tx
    .update(supplies)
    .set(patch)
    .where(and(eq(supplies.id, supplyId), isNull(supplies.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteSupply(tx: Executor, supplyId: string): Promise<void> {
  await tx
    .update(supplies)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(supplies.id, supplyId));
}

/**
 * Quantas fichas técnicas usam este insumo.
 *
 * O `ON DELETE RESTRICT` da FK não dispara em soft delete, e apagar um insumo
 * que está numa receita zeraria o custo do produto sem aviso. Quando o módulo
 * 4 chegar, esta consulta passa a ser uma chamada ao serviço de receitas.
 */
export async function countRecipeUsages(tx: Executor, supplyId: string): Promise<number> {
  const rows = await tx
    .select({ total: count() })
    .from(recipeItems)
    .where(eq(recipeItems.supplyId, supplyId));
  return rows[0]?.total ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Fornecedores                                                                */
/* -------------------------------------------------------------------------- */

export async function listSuppliers(
  tx: Executor,
  filters: { cursor?: string | undefined; limit: number; active?: boolean | undefined },
): Promise<SupplierRow[]> {
  const where = [isNull(suppliers.deletedAt)];
  if (filters.cursor) where.push(lt(suppliers.id, filters.cursor));
  if (filters.active !== undefined) where.push(eq(suppliers.active, filters.active));

  return tx
    .select()
    .from(suppliers)
    .where(and(...where))
    .orderBy(desc(suppliers.id))
    .limit(filters.limit);
}

export async function findSupplierById(
  tx: Executor,
  supplierId: string,
): Promise<SupplierRow | null> {
  const rows = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertSupplier(
  tx: Executor,
  values: typeof suppliers.$inferInsert,
): Promise<SupplierRow> {
  const rows = await tx.insert(suppliers).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o fornecedor.');
  return created;
}

export async function updateSupplier(
  tx: Executor,
  supplierId: string,
  patch: Partial<typeof suppliers.$inferInsert>,
): Promise<SupplierRow | null> {
  const rows = await tx
    .update(suppliers)
    .set(patch)
    .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteSupplier(tx: Executor, supplierId: string): Promise<void> {
  await tx
    .update(suppliers)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(suppliers.id, supplierId));
}

/* -------------------------------------------------------------------------- */
/* Compras                                                                     */
/* -------------------------------------------------------------------------- */

export interface PurchaseWithNames extends PurchaseRow {
  supplyName: string;
  supplierName: string | null;
}

export async function insertPurchase(
  tx: Executor,
  values: typeof supplyPurchases.$inferInsert,
): Promise<PurchaseRow> {
  const rows = await tx.insert(supplyPurchases).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao registrar a compra.');
  return created;
}

export interface ListPurchasesFilters {
  cursor?: string | undefined;
  limit: number;
  supplyId?: string | undefined;
  supplierId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export async function listPurchases(
  tx: Executor,
  filters: ListPurchasesFilters,
): Promise<PurchaseWithNames[]> {
  const where = [];
  if (filters.cursor) where.push(lt(supplyPurchases.id, filters.cursor));
  if (filters.supplyId) where.push(eq(supplyPurchases.supplyId, filters.supplyId));
  if (filters.supplierId) where.push(eq(supplyPurchases.supplierId, filters.supplierId));
  if (filters.from) where.push(gte(supplyPurchases.purchasedAt, filters.from));
  if (filters.to) where.push(lte(supplyPurchases.purchasedAt, filters.to));

  return tx
    .select({
      id: supplyPurchases.id,
      tenantId: supplyPurchases.tenantId,
      supplyId: supplyPurchases.supplyId,
      supplierId: supplyPurchases.supplierId,
      purchaseQty: supplyPurchases.purchaseQty,
      purchaseUnit: supplyPurchases.purchaseUnit,
      conversionFactor: supplyPurchases.conversionFactor,
      totalCents: supplyPurchases.totalCents,
      unitCost: supplyPurchases.unitCost,
      purchasedAt: supplyPurchases.purchasedAt,
      invoiceRef: supplyPurchases.invoiceRef,
      note: supplyPurchases.note,
      createdAt: supplyPurchases.createdAt,
      updatedAt: supplyPurchases.updatedAt,
      supplyName: supplies.name,
      supplierName: suppliers.name,
    })
    .from(supplyPurchases)
    .innerJoin(supplies, eq(supplyPurchases.supplyId, supplies.id))
    .leftJoin(suppliers, eq(supplyPurchases.supplierId, suppliers.id))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(supplyPurchases.id))
    .limit(filters.limit);
}

/** Insumos abaixo do mínimo — alimenta a notificação de estoque baixo (D8). */
export async function findLowStockSupplies(tx: Executor): Promise<SupplyWithBalance[]> {
  return tx
    .select(supplyWithBalanceColumns)
    .from(supplies)
    .leftJoin(
      stockItems,
      and(eq(stockItems.kind, 'supply'), eq(stockItems.refId, supplies.id)),
    )
    .where(
      and(
        isNull(supplies.deletedAt),
        eq(supplies.active, true),
        gte(supplies.minStockQty, sql`0.0001`),
        lte(sql`coalesce(${stockItems.qtyOnHand}, 0)`, supplies.minStockQty),
      ),
    )
    .orderBy(asc(supplies.name))
    .limit(200);
}
