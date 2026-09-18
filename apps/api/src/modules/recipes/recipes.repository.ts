import {
  productVariants,
  products,
  productionEntries,
  recipeItems,
  recipes,
  salesChannels,
  stockItems,
  supplies,
  type Executor,
} from '@cantina/db';
import { and, asc, desc, eq, inArray, isNull, lt, ne } from 'drizzle-orm';

/** Fichas técnicas e canais de venda (§4.5 do PLAN.md). */

export interface VariantContext {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  priceCents: number;
  stockMode: 'tracked' | 'on_demand';
}

export async function findVariantContext(
  tx: Executor,
  variantId: string,
): Promise<VariantContext | null> {
  const rows = await tx
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      stockMode: products.stockMode,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Receita                                                                     */
/* -------------------------------------------------------------------------- */

export type RecipeRow = typeof recipes.$inferSelect;

export async function findRecipeByVariant(
  tx: Executor,
  variantId: string,
): Promise<RecipeRow | null> {
  const rows = await tx
    .select()
    .from(recipes)
    .where(eq(recipes.productVariantId, variantId))
    .limit(1);
  return rows[0] ?? null;
}

export interface RecipeItemWithSupply {
  supplyId: string;
  supplyName: string;
  unit: 'g' | 'ml' | 'un';
  qty: number;
  wastePercent: number;
  /** Custo médio ponderado atual do insumo (D11). */
  avgUnitCost: number;
  /** Nunca comprado: o custo entra como zero e o total fica subestimado. */
  costUnknown: boolean;
}

export async function listRecipeItems(
  tx: Executor,
  recipeId: string,
): Promise<RecipeItemWithSupply[]> {
  const rows = await tx
    .select({
      supplyId: recipeItems.supplyId,
      supplyName: supplies.name,
      unit: supplies.usageUnit,
      qty: recipeItems.qty,
      wastePercent: recipeItems.wastePercent,
      avgUnitCost: supplies.avgUnitCost,
    })
    .from(recipeItems)
    .innerJoin(supplies, eq(recipeItems.supplyId, supplies.id))
    .where(eq(recipeItems.recipeId, recipeId))
    .orderBy(asc(supplies.name));

  return rows.map((row) => ({ ...row, costUnknown: row.avgUnitCost <= 0 }));
}

export interface RecipeWithItems {
  yieldQty: number;
  items: RecipeItemWithSupply[];
}

/**
 * Receitas de várias variações de uma vez — o cardápio da vitrine precisa
 * disso para calcular disponibilidade sem um N+1 por produto.
 *
 * As quantidades vêm CRUAS, para o rendimento inteiro e sem perda aplicada.
 * Normalizar aqui espalharia a fórmula de custo por duas camadas; ela vive
 * inteira em `@cantina/domain`.
 */
export async function listRecipesForVariants(
  tx: Executor,
  variantIds: string[],
): Promise<Map<string, RecipeWithItems>> {
  const output = new Map<string, RecipeWithItems>();
  if (variantIds.length === 0) return output;

  const rows = await tx
    .select({
      variantId: recipes.productVariantId,
      yieldQty: recipes.yieldQty,
      supplyId: recipeItems.supplyId,
      supplyName: supplies.name,
      unit: supplies.usageUnit,
      qty: recipeItems.qty,
      wastePercent: recipeItems.wastePercent,
      avgUnitCost: supplies.avgUnitCost,
    })
    .from(recipes)
    .innerJoin(recipeItems, eq(recipeItems.recipeId, recipes.id))
    .innerJoin(supplies, eq(recipeItems.supplyId, supplies.id))
    .where(inArray(recipes.productVariantId, variantIds));

  for (const row of rows) {
    const item: RecipeItemWithSupply = {
      supplyId: row.supplyId,
      supplyName: row.supplyName,
      unit: row.unit,
      qty: row.qty,
      wastePercent: row.wastePercent,
      avgUnitCost: row.avgUnitCost,
      costUnknown: row.avgUnitCost <= 0,
    };

    const bucket = output.get(row.variantId);
    if (bucket) bucket.items.push(item);
    else output.set(row.variantId, { yieldQty: row.yieldQty, items: [item] });
  }

  return output;
}

export interface ProductVariantContext extends VariantContext {
  active: boolean;
}

/** Variações vivas de um produto, na ordem do cadastro. */
export async function listVariantsOfProduct(
  tx: Executor,
  productId: string,
): Promise<ProductVariantContext[]> {
  return tx
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      stockMode: products.stockMode,
      active: productVariants.active,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.productId, productId),
        isNull(productVariants.deletedAt),
        isNull(products.deletedAt),
      ),
    )
    .orderBy(asc(productVariants.position), asc(productVariants.id));
}

export async function findVariantContexts(
  tx: Executor,
  variantIds: string[],
): Promise<Map<string, VariantContext>> {
  const output = new Map<string, VariantContext>();
  if (variantIds.length === 0) return output;

  const rows = await tx
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      stockMode: products.stockMode,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(inArray(productVariants.id, variantIds), isNull(productVariants.deletedAt)),
    );

  for (const row of rows) output.set(row.variantId, row);
  return output;
}

export async function upsertRecipe(
  tx: Executor,
  values: { tenantId: string; productVariantId: string; yieldQty: number; notes: string | null },
): Promise<RecipeRow> {
  const rows = await tx
    .insert(recipes)
    .values(values)
    .onConflictDoUpdate({
      target: [recipes.tenantId, recipes.productVariantId],
      set: { yieldQty: values.yieldQty, notes: values.notes },
    })
    .returning();

  const saved = rows[0];
  if (!saved) throw new Error('Falha ao salvar a ficha técnica.');
  return saved;
}

/**
 * Substituição integral dos itens.
 *
 * A tela edita a receita inteira, e um diff por linha exigiria identidade
 * estável para algo que o lojista pensa como "a lista de ingredientes".
 */
export async function replaceRecipeItems(
  tx: Executor,
  tenantId: string,
  recipeId: string,
  items: Array<{ supplyId: string; qty: number; wastePercent: number }>,
): Promise<void> {
  await tx.delete(recipeItems).where(eq(recipeItems.recipeId, recipeId));
  if (items.length === 0) return;

  await tx
    .insert(recipeItems)
    .values(items.map((item) => ({ ...item, tenantId, recipeId })));
}

export async function deleteRecipe(tx: Executor, recipeId: string): Promise<void> {
  await tx.delete(recipeItems).where(eq(recipeItems.recipeId, recipeId));
  await tx.delete(recipes).where(eq(recipes.id, recipeId));
}

export async function assertSuppliesExist(
  tx: Executor,
  supplyIds: string[],
): Promise<string[]> {
  if (supplyIds.length === 0) return [];

  const found = await tx
    .select({ id: supplies.id })
    .from(supplies)
    .where(and(inArray(supplies.id, supplyIds), isNull(supplies.deletedAt)));

  const known = new Set(found.map((row) => row.id));
  return supplyIds.filter((id) => !known.has(id));
}

/* -------------------------------------------------------------------------- */
/* Saldos de insumo — para disponibilidade derivada (D9)                       */
/* -------------------------------------------------------------------------- */

export async function findSupplyBalances(
  tx: Executor,
  supplyIds: string[],
): Promise<Map<string, { qtyOnHand: number; qtyReserved: number }>> {
  const output = new Map<string, { qtyOnHand: number; qtyReserved: number }>();
  if (supplyIds.length === 0) return output;

  const rows = await tx
    .select({
      refId: stockItems.refId,
      qtyOnHand: stockItems.qtyOnHand,
      qtyReserved: stockItems.qtyReserved,
    })
    .from(stockItems)
    .where(and(eq(stockItems.kind, 'supply'), inArray(stockItems.refId, supplyIds)));

  for (const row of rows) {
    output.set(row.refId, { qtyOnHand: row.qtyOnHand, qtyReserved: row.qtyReserved });
  }
  return output;
}

export async function findVariantBalances(
  tx: Executor,
  variantIds: string[],
): Promise<Map<string, { qtyOnHand: number; qtyReserved: number }>> {
  const output = new Map<string, { qtyOnHand: number; qtyReserved: number }>();
  if (variantIds.length === 0) return output;

  const rows = await tx
    .select({
      refId: stockItems.refId,
      qtyOnHand: stockItems.qtyOnHand,
      qtyReserved: stockItems.qtyReserved,
    })
    .from(stockItems)
    .where(and(eq(stockItems.kind, 'product_variant'), inArray(stockItems.refId, variantIds)));

  for (const row of rows) {
    output.set(row.refId, { qtyOnHand: row.qtyOnHand, qtyReserved: row.qtyReserved });
  }
  return output;
}

/* -------------------------------------------------------------------------- */
/* Canais de venda                                                             */
/* -------------------------------------------------------------------------- */

export type SalesChannelRow = typeof salesChannels.$inferSelect;

export async function listSalesChannels(
  tx: Executor,
  filters: { active?: boolean | undefined; cursor?: string | undefined; limit: number },
): Promise<SalesChannelRow[]> {
  const where = [isNull(salesChannels.deletedAt)];
  if (filters.active !== undefined) where.push(eq(salesChannels.active, filters.active));
  if (filters.cursor) where.push(lt(salesChannels.id, filters.cursor));

  return tx
    .select()
    .from(salesChannels)
    .where(and(...where))
    .orderBy(desc(salesChannels.isDefault), asc(salesChannels.name))
    .limit(filters.limit);
}

export async function findSalesChannelById(
  tx: Executor,
  channelId: string,
): Promise<SalesChannelRow | null> {
  const rows = await tx
    .select()
    .from(salesChannels)
    .where(and(eq(salesChannels.id, channelId), isNull(salesChannels.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findSalesChannelsByIds(
  tx: Executor,
  channelIds: string[],
): Promise<SalesChannelRow[]> {
  if (channelIds.length === 0) return [];
  return tx
    .select()
    .from(salesChannels)
    .where(and(inArray(salesChannels.id, channelIds), isNull(salesChannels.deletedAt)));
}

export async function findDefaultSalesChannel(
  tx: Executor,
): Promise<SalesChannelRow | null> {
  const rows = await tx
    .select()
    .from(salesChannels)
    .where(
      and(
        eq(salesChannels.isDefault, true),
        eq(salesChannels.active, true),
        isNull(salesChannels.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertSalesChannel(
  tx: Executor,
  values: typeof salesChannels.$inferInsert,
): Promise<SalesChannelRow> {
  const rows = await tx.insert(salesChannels).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o canal de venda.');
  return created;
}

export async function updateSalesChannel(
  tx: Executor,
  channelId: string,
  patch: Partial<typeof salesChannels.$inferInsert>,
): Promise<SalesChannelRow | null> {
  const rows = await tx
    .update(salesChannels)
    .set(patch)
    .where(and(eq(salesChannels.id, channelId), isNull(salesChannels.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function clearDefaultSalesChannel(
  tx: Executor,
  exceptChannelId: string,
): Promise<void> {
  await tx
    .update(salesChannels)
    .set({ isDefault: false })
    .where(ne(salesChannels.id, exceptChannelId));
}

export async function softDeleteSalesChannel(tx: Executor, channelId: string): Promise<void> {
  await tx
    .update(salesChannels)
    .set({ deletedAt: new Date(), active: false, isDefault: false })
    .where(eq(salesChannels.id, channelId));
}

/* -------------------------------------------------------------------------- */
/* Produção (D19)                                                              */
/* -------------------------------------------------------------------------- */

export async function insertProductionEntry(
  tx: Executor,
  values: typeof productionEntries.$inferInsert,
): Promise<typeof productionEntries.$inferSelect> {
  const rows = await tx.insert(productionEntries).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao registrar a produção.');
  return created;
}
