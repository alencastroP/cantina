import type {
  CreateProductRequest,
  ListProductsQuery,
  Page,
  Product,
  ProductDetail,
  UpdateAvailabilityRequest,
  UpdateProductRequest,
  Variant,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import { slugify, uniqueSlug } from '../../shared/slug';
import * as repository from './catalog.repository';

/** Produtos (§6.4 do PLAN.md). */

export function toVariant(row: repository.VariantRow): Variant {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    sku: row.sku,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    isDefault: row.isDefault,
    position: row.position,
    active: row.active,
  };
}

function toProduct(row: repository.ProductWithCategory, variants: Variant[]): Product {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    stockMode: row.stockMode,
    availableFor: row.availableFor,
    active: row.active,
    pausedUntil: row.pausedUntil?.toISOString() ?? null,
    position: row.position,
    variants,
  };
}

export async function assemble(
  tx: Transaction,
  row: repository.ProductWithCategory,
): Promise<ProductDetail> {
  const [variants, images] = await Promise.all([
    repository.listVariantsByProductIds(tx, [row.id]),
    repository.listImages(tx, row.id),
  ]);

  return {
    ...toProduct(row, variants.map(toVariant)),
    images: images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      position: image.position,
    })),
  };
}

export async function list(tx: Transaction, query: ListProductsQuery): Promise<Page<Product>> {
  const rows = await repository.listProducts(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    categoryId: query.categoryId,
    active: query.active,
    availableFor: query.availableFor,
    q: query.q,
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  // Uma consulta para as variações da página inteira, não uma por produto.
  const variants = await repository.listVariantsByProductIds(
    tx,
    page.map((row) => row.id),
  );

  const byProduct = new Map<string, Variant[]>();
  for (const variant of variants) {
    const bucket = byProduct.get(variant.productId);
    if (bucket) bucket.push(toVariant(variant));
    else byProduct.set(variant.productId, [toVariant(variant)]);
  }

  const items = page.map((row) => toProduct(row, byProduct.get(row.id) ?? []));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function get(tx: Transaction, productId: string): Promise<ProductDetail> {
  const row = await repository.findProductById(tx, productId);
  if (!row) throw notFound('Produto não encontrado.');
  return assemble(tx, row);
}

async function assertCategoryExists(tx: Transaction, categoryId: string): Promise<void> {
  const category = await repository.findCategoryById(tx, categoryId);
  if (!category) throw unprocessable('Categoria não encontrada.', { categoryId });
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreateProductRequest,
): Promise<ProductDetail> {
  if (input.categoryId) await assertCategoryExists(tx, input.categoryId);

  const base = slugify(input.slug ?? input.name);
  const slug = uniqueSlug(base, await repository.findProductSlugs(tx, base));
  const position = (await repository.maxProductPosition(tx)) + 1;

  const product = await repository.insertProduct(tx, {
    tenantId,
    categoryId: input.categoryId ?? null,
    name: input.name,
    slug,
    description: input.description ?? null,
    stockMode: input.stockMode,
    availableFor: input.availableFor,
    active: input.active,
    position,
  });

  // Exatamente uma variação padrão (P13). Se ninguém marcou, a primeira é.
  const defaultIndex = Math.max(
    0,
    input.variants.findIndex((variant) => variant.isDefault === true),
  );

  try {
    await repository.insertVariants(
      tx,
      input.variants.map((variant, index) => ({
        tenantId,
        productId: product.id,
        name: variant.name,
        sku: variant.sku ?? null,
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents ?? null,
        isDefault: index === defaultIndex,
        active: variant.active ?? true,
        position: index,
      })),
    );
  } catch (error) {
    if (isUniqueViolation(error, 'product_variants_tenant_sku_uq')) {
      throw conflict('Já existe uma variação com este SKU.');
    }
    throw error;
  }

  await recordAudit(tx, {
    tenantId,
    action: 'product.created',
    entityType: 'product',
    entityId: product.id,
    after: { name: product.name, slug: product.slug, variants: input.variants.length },
  });

  return get(tx, product.id);
}

export async function update(
  tx: Transaction,
  tenantId: string,
  productId: string,
  patch: UpdateProductRequest,
): Promise<ProductDetail> {
  const before = await repository.findProductById(tx, productId);
  if (!before) throw notFound('Produto não encontrado.');

  if (patch.categoryId) await assertCategoryExists(tx, patch.categoryId);

  const values: Parameters<typeof repository.updateProduct>[2] = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.stockMode !== undefined) values.stockMode = patch.stockMode;
  if (patch.availableFor !== undefined) values.availableFor = patch.availableFor;
  if (patch.active !== undefined) values.active = patch.active;

  if (patch.slug !== undefined) {
    const base = slugify(patch.slug);
    values.slug = uniqueSlug(base, await repository.findProductSlugs(tx, base));
  }

  const updated = await repository.updateProduct(tx, productId, values);
  if (!updated) throw notFound('Produto não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'product.updated',
    entityType: 'product',
    entityId: productId,
    before: {
      name: before.name,
      slug: before.slug,
      stockMode: before.stockMode,
      active: before.active,
    },
    after: {
      name: updated.name,
      slug: updated.slug,
      stockMode: updated.stockMode,
      active: updated.active,
    },
  });

  return get(tx, productId);
}

/**
 * Pausa da vitrine — o "acabou hoje".
 *
 * Separada do `active` porque são decisões de pessoas diferentes: quem
 * desativa está mexendo no cadastro, quem pausa está tocando o balcão.
 */
export async function updateAvailability(
  tx: Transaction,
  tenantId: string,
  productId: string,
  patch: UpdateAvailabilityRequest,
): Promise<ProductDetail> {
  const before = await repository.findProductById(tx, productId);
  if (!before) throw notFound('Produto não encontrado.');

  const values: Parameters<typeof repository.updateProduct>[2] = {};
  if (patch.active !== undefined) values.active = patch.active;

  if (patch.pausedUntil !== undefined) {
    if (patch.pausedUntil === null) {
      values.pausedUntil = null;
    } else {
      const until = new Date(patch.pausedUntil);
      if (until.getTime() <= Date.now()) {
        throw unprocessable('A pausa precisa terminar no futuro. Para despausar, envie null.');
      }
      values.pausedUntil = until;
    }
  }

  const updated = await repository.updateProduct(tx, productId, values);
  if (!updated) throw notFound('Produto não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'product.availability_changed',
    entityType: 'product',
    entityId: productId,
    before: { active: before.active, pausedUntil: before.pausedUntil },
    after: { active: updated.active, pausedUntil: updated.pausedUntil },
  });

  return get(tx, productId);
}

/**
 * Remoção lógica.
 *
 * Produto nunca sai do banco: `delivery_order_items` guarda `product_variant_id`
 * além do snapshot de nome, e a ficha técnica do módulo 4 aponta para a
 * variação. Apagar de verdade quebraria o histórico e o cálculo de custo.
 */
export async function remove(
  tx: Transaction,
  tenantId: string,
  productId: string,
): Promise<void> {
  const product = await repository.findProductById(tx, productId);
  if (!product) throw notFound('Produto não encontrado.');

  await repository.softDeleteProduct(tx, productId);

  await recordAudit(tx, {
    tenantId,
    action: 'product.removed',
    entityType: 'product',
    entityId: productId,
    before: { name: product.name, slug: product.slug },
  });
}

export async function reorder(
  tx: Transaction,
  tenantId: string,
  ids: string[],
): Promise<void> {
  // Reordenação é dentro de uma categoria; a lista chega com os ids daquela
  // categoria, na ordem final.
  const found = await Promise.all(ids.map((id) => repository.findProductById(tx, id)));
  const missing = ids.filter((_, index) => !found[index]);

  if (missing.length > 0) {
    throw unprocessable('A lista contém produtos inexistentes.', { missing });
  }

  await repository.setProductPositions(tx, ids);
  await recordAudit(tx, {
    tenantId,
    action: 'product.reordered',
    entityType: 'product',
    after: { count: ids.length },
  });
}
