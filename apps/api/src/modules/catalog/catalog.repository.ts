import {
  categories,
  productImages,
  productVariants,
  products,
  type Executor,
} from '@cantina/db';
import { and, asc, count, desc, eq, ilike, inArray, isNull, like, lt, ne, sql } from 'drizzle-orm';

/**
 * Consultas do catálogo (§4.4 do PLAN.md).
 *
 * Nenhuma escrita em `stock_items` sai daqui: estoque é do módulo 3, e o
 * saldo de uma variação nasce no primeiro movimento. Catálogo criando linha
 * de estoque seria o começo de dois donos para o mesmo dado.
 */

/* -------------------------------------------------------------------------- */
/* Categorias                                                                  */
/* -------------------------------------------------------------------------- */

export type CategoryRow = typeof categories.$inferSelect;

export async function listCategories(tx: Executor): Promise<CategoryRow[]> {
  return tx
    .select()
    .from(categories)
    .where(isNull(categories.deletedAt))
    .orderBy(asc(categories.position), asc(categories.name));
}

/** Contagem de produtos ativos por categoria, numa consulta só. */
export async function countProductsByCategory(tx: Executor): Promise<Map<string, number>> {
  const rows = await tx
    .select({ categoryId: products.categoryId, total: count() })
    .from(products)
    .where(isNull(products.deletedAt))
    .groupBy(products.categoryId);

  const output = new Map<string, number>();
  for (const row of rows) {
    if (row.categoryId) output.set(row.categoryId, row.total);
  }
  return output;
}

export async function findCategoryById(
  tx: Executor,
  categoryId: string,
): Promise<CategoryRow | null> {
  const rows = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCategorySlugs(tx: Executor, prefix: string): Promise<string[]> {
  const rows = await tx
    .select({ slug: categories.slug })
    .from(categories)
    .where(like(categories.slug, `${prefix}%`));
  return rows.map((row) => row.slug);
}

export async function maxCategoryPosition(tx: Executor): Promise<number> {
  const rows = await tx
    .select({ value: sql<number>`coalesce(max(${categories.position}), -1)` })
    .from(categories)
    .where(isNull(categories.deletedAt));
  return rows[0]?.value ?? -1;
}

export async function insertCategory(
  tx: Executor,
  values: typeof categories.$inferInsert,
): Promise<CategoryRow> {
  const rows = await tx.insert(categories).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar a categoria.');
  return created;
}

export async function updateCategory(
  tx: Executor,
  categoryId: string,
  patch: Partial<typeof categories.$inferInsert>,
): Promise<CategoryRow | null> {
  const rows = await tx
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteCategory(tx: Executor, categoryId: string): Promise<void> {
  await tx.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, categoryId));
}

/**
 * Solta os produtos da categoria removida.
 *
 * O `ON DELETE SET NULL` da FK não dispara em soft delete — precisa ser
 * explícito, ou os produtos ficariam apontando para uma categoria invisível
 * e sumiriam do cardápio sem explicação.
 */
export async function detachProductsFromCategory(
  tx: Executor,
  categoryId: string,
): Promise<number> {
  const rows = await tx
    .update(products)
    .set({ categoryId: null })
    .where(eq(products.categoryId, categoryId))
    .returning({ id: products.id });
  return rows.length;
}

export async function setCategoryPositions(tx: Executor, ids: string[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await tx.update(categories).set({ position }).where(eq(categories.id, id));
  }
}

/* -------------------------------------------------------------------------- */
/* Produtos                                                                    */
/* -------------------------------------------------------------------------- */

export type ProductRow = typeof products.$inferSelect;

export interface ProductWithCategory extends ProductRow {
  categoryName: string | null;
}

const productColumns = {
  id: products.id,
  tenantId: products.tenantId,
  categoryId: products.categoryId,
  name: products.name,
  slug: products.slug,
  description: products.description,
  imageUrl: products.imageUrl,
  stockMode: products.stockMode,
  availableFor: products.availableFor,
  active: products.active,
  pausedUntil: products.pausedUntil,
  position: products.position,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  deletedAt: products.deletedAt,
};

export interface ListProductsFilters {
  cursor?: string | undefined;
  limit: number;
  categoryId?: string | undefined;
  active?: boolean | undefined;
  availableFor?: 'delivery' | 'preorder' | 'both' | undefined;
  q?: string | undefined;
}

/**
 * Listagem do painel: mais recentes primeiro, cursor sobre o id.
 *
 * O cardápio da vitrine (módulo 8) NÃO usa esta função: lá a ordem é por
 * posição de categoria e de produto, e a página inteira vai de uma vez —
 * cursor sobre `position` exigiria desempate estável que a tela de
 * arrastar-e-soltar não garante.
 */
export async function listProducts(
  tx: Executor,
  filters: ListProductsFilters,
): Promise<ProductWithCategory[]> {
  const where = [isNull(products.deletedAt)];
  if (filters.cursor) where.push(lt(products.id, filters.cursor));
  if (filters.categoryId) where.push(eq(products.categoryId, filters.categoryId));
  if (filters.active !== undefined) where.push(eq(products.active, filters.active));
  if (filters.q) where.push(ilike(products.name, `%${filters.q}%`));
  if (filters.availableFor && filters.availableFor !== 'both') {
    // Um produto marcado como `both` serve aos dois fluxos.
    where.push(inArray(products.availableFor, [filters.availableFor, 'both']));
  }

  return tx
    .select({ ...productColumns, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...where))
    .orderBy(desc(products.id))
    .limit(filters.limit);
}

export async function findProductById(
  tx: Executor,
  productId: string,
): Promise<ProductWithCategory | null> {
  const rows = await tx
    .select({ ...productColumns, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findProductSlugs(tx: Executor, prefix: string): Promise<string[]> {
  const rows = await tx
    .select({ slug: products.slug })
    .from(products)
    .where(like(products.slug, `${prefix}%`));
  return rows.map((row) => row.slug);
}

export async function maxProductPosition(tx: Executor): Promise<number> {
  const rows = await tx
    .select({ value: sql<number>`coalesce(max(${products.position}), -1)` })
    .from(products)
    .where(isNull(products.deletedAt));
  return rows[0]?.value ?? -1;
}

export async function insertProduct(
  tx: Executor,
  values: typeof products.$inferInsert,
): Promise<ProductRow> {
  const rows = await tx.insert(products).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o produto.');
  return created;
}

export async function updateProduct(
  tx: Executor,
  productId: string,
  patch: Partial<typeof products.$inferInsert>,
): Promise<ProductRow | null> {
  const rows = await tx
    .update(products)
    .set(patch)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteProduct(tx: Executor, productId: string): Promise<void> {
  await tx
    .update(products)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(products.id, productId));
  // As variações somem junto: preço e receita não fazem sentido sem o produto.
  await tx
    .update(productVariants)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(productVariants.productId, productId));
}

export async function setProductPositions(tx: Executor, ids: string[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await tx.update(products).set({ position }).where(eq(products.id, id));
  }
}

/* -------------------------------------------------------------------------- */
/* Variações                                                                   */
/* -------------------------------------------------------------------------- */

export type VariantRow = typeof productVariants.$inferSelect;

export async function listVariantsByProductIds(
  tx: Executor,
  productIds: string[],
): Promise<VariantRow[]> {
  if (productIds.length === 0) return [];
  return tx
    .select()
    .from(productVariants)
    .where(
      and(inArray(productVariants.productId, productIds), isNull(productVariants.deletedAt)),
    )
    .orderBy(asc(productVariants.position), asc(productVariants.name));
}

export async function findVariantById(
  tx: Executor,
  variantId: string,
): Promise<VariantRow | null> {
  const rows = await tx
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertVariants(
  tx: Executor,
  values: (typeof productVariants.$inferInsert)[],
): Promise<VariantRow[]> {
  if (values.length === 0) return [];
  return tx.insert(productVariants).values(values).returning();
}

export async function updateVariant(
  tx: Executor,
  variantId: string,
  patch: Partial<typeof productVariants.$inferInsert>,
): Promise<VariantRow | null> {
  const rows = await tx
    .update(productVariants)
    .set(patch)
    .where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteVariant(tx: Executor, variantId: string): Promise<void> {
  await tx
    .update(productVariants)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(productVariants.id, variantId));
}

/** Exatamente uma variação padrão por produto. */
export async function clearDefaultVariant(
  tx: Executor,
  productId: string,
  exceptVariantId: string,
): Promise<void> {
  await tx
    .update(productVariants)
    .set({ isDefault: false })
    .where(
      and(eq(productVariants.productId, productId), ne(productVariants.id, exceptVariantId)),
    );
}

export async function countActiveVariants(tx: Executor, productId: string): Promise<number> {
  const rows = await tx
    .select({ total: count() })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, productId),
        eq(productVariants.active, true),
        isNull(productVariants.deletedAt),
      ),
    );
  return rows[0]?.total ?? 0;
}

export async function maxVariantPosition(tx: Executor, productId: string): Promise<number> {
  const rows = await tx
    .select({ value: sql<number>`coalesce(max(${productVariants.position}), -1)` })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)));
  return rows[0]?.value ?? -1;
}

/* -------------------------------------------------------------------------- */
/* Imagens                                                                     */
/* -------------------------------------------------------------------------- */

export type ImageRow = typeof productImages.$inferSelect;

export async function listImages(tx: Executor, productId: string): Promise<ImageRow[]> {
  return tx
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position));
}

export async function insertImage(
  tx: Executor,
  values: typeof productImages.$inferInsert,
): Promise<ImageRow> {
  const rows = await tx.insert(productImages).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao registrar a imagem.');
  return created;
}

export async function findImageById(tx: Executor, imageId: string): Promise<ImageRow | null> {
  const rows = await tx
    .select()
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteImage(tx: Executor, imageId: string): Promise<void> {
  await tx.delete(productImages).where(eq(productImages.id, imageId));
}

export async function setImagePositions(tx: Executor, ids: string[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await tx.update(productImages).set({ position }).where(eq(productImages.id, id));
  }
}
