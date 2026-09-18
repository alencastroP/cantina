import type {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import { slugify, uniqueSlug } from '../../shared/slug';
import * as repository from './catalog.repository';

/** Categorias do cardápio (§6.4 do PLAN.md). */

function toCategory(row: repository.CategoryRow, productCount: number): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    position: row.position,
    active: row.active,
    productCount,
  };
}

export async function list(tx: Transaction): Promise<Category[]> {
  const [rows, counts] = await Promise.all([
    repository.listCategories(tx),
    repository.countProductsByCategory(tx),
  ]);
  return rows.map((row) => toCategory(row, counts.get(row.id) ?? 0));
}

async function resolveSlug(
  tx: Transaction,
  desired: string | undefined,
  fallbackName: string,
): Promise<string> {
  const base = slugify(desired ?? fallbackName);
  return uniqueSlug(base, await repository.findCategorySlugs(tx, base));
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreateCategoryRequest,
): Promise<Category> {
  const slug = await resolveSlug(tx, input.slug, input.name);
  const position = (await repository.maxCategoryPosition(tx)) + 1;

  try {
    const created = await repository.insertCategory(tx, {
      tenantId,
      name: input.name,
      slug,
      description: input.description ?? null,
      active: input.active ?? true,
      position,
    });

    await recordAudit(tx, {
      tenantId,
      action: 'category.created',
      entityType: 'category',
      entityId: created.id,
      after: { name: created.name, slug: created.slug },
    });

    return toCategory(created, 0);
  } catch (error) {
    if (isUniqueViolation(error, 'categories_tenant_slug_uq')) {
      throw conflict('Já existe uma categoria com este endereço.', { slug });
    }
    throw error;
  }
}

export async function update(
  tx: Transaction,
  tenantId: string,
  categoryId: string,
  patch: UpdateCategoryRequest,
): Promise<Category> {
  const before = await repository.findCategoryById(tx, categoryId);
  if (!before) throw notFound('Categoria não encontrada.');

  const values: Parameters<typeof repository.updateCategory>[2] = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.active !== undefined) values.active = patch.active;

  // Renomear NÃO regera o slug: ele já pode estar em link compartilhado.
  // Só uma edição explícita do campo muda o endereço.
  if (patch.slug !== undefined) {
    values.slug = await resolveSlug(tx, patch.slug, patch.name ?? before.name);
  }

  try {
    const updated = await repository.updateCategory(tx, categoryId, values);
    if (!updated) throw notFound('Categoria não encontrada.');

    await recordAudit(tx, {
      tenantId,
      action: 'category.updated',
      entityType: 'category',
      entityId: categoryId,
      before: { name: before.name, slug: before.slug, active: before.active },
      after: { name: updated.name, slug: updated.slug, active: updated.active },
    });

    const counts = await repository.countProductsByCategory(tx);
    return toCategory(updated, counts.get(categoryId) ?? 0);
  } catch (error) {
    if (isUniqueViolation(error, 'categories_tenant_slug_uq')) {
      throw conflict('Já existe uma categoria com este endereço.');
    }
    throw error;
  }
}

/**
 * Remover a categoria não remove os produtos.
 *
 * Eles voltam para "sem categoria" e continuam no cardápio. Sumir com o
 * produto porque a categoria foi apagada seria uma perda silenciosa de
 * faturamento — e o lojista levaria dias para notar.
 */
export async function remove(
  tx: Transaction,
  tenantId: string,
  categoryId: string,
): Promise<{ detachedProducts: number }> {
  const category = await repository.findCategoryById(tx, categoryId);
  if (!category) throw notFound('Categoria não encontrada.');

  const detachedProducts = await repository.detachProductsFromCategory(tx, categoryId);
  await repository.softDeleteCategory(tx, categoryId);

  await recordAudit(tx, {
    tenantId,
    action: 'category.removed',
    entityType: 'category',
    entityId: categoryId,
    before: { name: category.name },
    after: { detachedProducts },
  });

  return { detachedProducts };
}

export async function reorder(
  tx: Transaction,
  tenantId: string,
  ids: string[],
): Promise<Category[]> {
  const existing = await repository.listCategories(tx);
  const known = new Set(existing.map((row) => row.id));

  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw unprocessable('A lista contém categorias inexistentes.', { unknown });
  }

  // A lista precisa ser completa: reordenar metade deixaria a outra metade
  // com posições antigas, e a ordem final dependeria do que já estava lá.
  if (ids.length !== existing.length) {
    throw unprocessable('Envie todas as categorias na ordem desejada.', {
      expected: existing.length,
      received: ids.length,
    });
  }

  await repository.setCategoryPositions(tx, ids);
  await recordAudit(tx, {
    tenantId,
    action: 'category.reordered',
    entityType: 'category',
    after: { count: ids.length },
  });

  return list(tx);
}
