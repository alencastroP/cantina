import type {
  CreateVariantRequest,
  UpdateVariantRequest,
  Variant,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as repository from './catalog.repository';
import { toVariant } from './products.service';

/**
 * Variações (§6.4 do PLAN.md).
 *
 * P13 é uma invariante do banco tanto quanto do contrato: todo produto tem
 * ao menos uma variação ATIVA. É ela que carrega preço, receita e estoque —
 * um produto sem nenhuma seria um item de cardápio que não dá para vender e
 * cujo custo não dá para calcular.
 */

async function loadVariant(tx: Transaction, variantId: string) {
  const variant = await repository.findVariantById(tx, variantId);
  if (!variant) throw notFound('Variação não encontrada.');
  return variant;
}

export async function listForProduct(tx: Transaction, productId: string): Promise<Variant[]> {
  const product = await repository.findProductById(tx, productId);
  if (!product) throw notFound('Produto não encontrado.');

  const rows = await repository.listVariantsByProductIds(tx, [productId]);
  return rows.map(toVariant);
}

export async function create(
  tx: Transaction,
  tenantId: string,
  productId: string,
  input: CreateVariantRequest,
): Promise<Variant> {
  const product = await repository.findProductById(tx, productId);
  if (!product) throw notFound('Produto não encontrado.');

  const position = (await repository.maxVariantPosition(tx, productId)) + 1;

  try {
    const [created] = await repository.insertVariants(tx, [
      {
        tenantId,
        productId,
        name: input.name,
        sku: input.sku ?? null,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents ?? null,
        isDefault: input.isDefault ?? false,
        active: input.active ?? true,
        position,
      },
    ]);

    if (!created) throw new Error('Falha ao criar a variação.');

    if (created.isDefault) {
      await repository.clearDefaultVariant(tx, productId, created.id);
    }

    await recordAudit(tx, {
      tenantId,
      action: 'variant.created',
      entityType: 'product_variant',
      entityId: created.id,
      after: { productId, name: created.name, priceCents: created.priceCents },
    });

    return toVariant(created);
  } catch (error) {
    if (isUniqueViolation(error, 'product_variants_tenant_sku_uq')) {
      throw conflict('Já existe uma variação com este SKU.', { sku: input.sku });
    }
    throw error;
  }
}

export async function update(
  tx: Transaction,
  tenantId: string,
  variantId: string,
  patch: UpdateVariantRequest,
): Promise<Variant> {
  const before = await loadVariant(tx, variantId);

  // Desativar a última variação ativa deixaria o produto invendável — e o
  // lojista só descobriria pela vitrine, não por aqui.
  if (patch.active === false && before.active) {
    const active = await repository.countActiveVariants(tx, before.productId);
    if (active <= 1) {
      throw conflict(
        'Este produto ficaria sem nenhuma variação ativa. Desative o produto inteiro, se é o que você quer.',
      );
    }
  }

  const values: Parameters<typeof repository.updateVariant>[2] = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.sku !== undefined) values.sku = patch.sku;
  if (patch.priceCents !== undefined) values.priceCents = patch.priceCents;
  if (patch.compareAtPriceCents !== undefined) {
    values.compareAtPriceCents = patch.compareAtPriceCents;
  }
  if (patch.active !== undefined) values.active = patch.active;
  if (patch.isDefault === true) values.isDefault = true;

  const resultingPrice = patch.priceCents ?? before.priceCents;
  const resultingCompare =
    patch.compareAtPriceCents !== undefined ? patch.compareAtPriceCents : before.compareAtPriceCents;

  if (resultingCompare !== null && resultingCompare <= resultingPrice) {
    // A checagem também vale no PATCH: baixar só o "de" pelo caminho parcial
    // driblaria a validação do schema, que só vê o corpo enviado.
    throw unprocessable('O preço "de" precisa ser maior que o preço de venda.', {
      priceCents: resultingPrice,
      compareAtPriceCents: resultingCompare,
    });
  }

  try {
    const updated = await repository.updateVariant(tx, variantId, values);
    if (!updated) throw notFound('Variação não encontrada.');

    if (patch.isDefault === true) {
      await repository.clearDefaultVariant(tx, updated.productId, updated.id);
    }

    // P7 pede rastro específico de mudança de preço: é o que explica uma
    // margem que mudou de um mês para o outro.
    if (patch.priceCents !== undefined && patch.priceCents !== before.priceCents) {
      await recordAudit(tx, {
        tenantId,
        action: 'variant.price_changed',
        entityType: 'product_variant',
        entityId: variantId,
        before: { priceCents: before.priceCents },
        after: { priceCents: updated.priceCents },
      });
    }

    await recordAudit(tx, {
      tenantId,
      action: 'variant.updated',
      entityType: 'product_variant',
      entityId: variantId,
      before: { name: before.name, sku: before.sku, active: before.active },
      after: { name: updated.name, sku: updated.sku, active: updated.active },
    });

    return toVariant(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'product_variants_tenant_sku_uq')) {
      throw conflict('Já existe uma variação com este SKU.', { sku: patch.sku });
    }
    throw error;
  }
}

export async function remove(
  tx: Transaction,
  tenantId: string,
  variantId: string,
): Promise<void> {
  const variant = await loadVariant(tx, variantId);

  const active = await repository.countActiveVariants(tx, variant.productId);
  if (active <= 1) {
    throw conflict(
      'Todo produto precisa de ao menos uma variação. Remova o produto inteiro, se é o que você quer.',
    );
  }

  await repository.softDeleteVariant(tx, variantId);

  // O produto não pode ficar sem padrão: promove a primeira que sobrou.
  if (variant.isDefault) {
    const remaining = await repository.listVariantsByProductIds(tx, [variant.productId]);
    const next = remaining.find((row) => row.id !== variantId && row.active);
    if (next) {
      await repository.updateVariant(tx, next.id, { isDefault: true });
    }
  }

  await recordAudit(tx, {
    tenantId,
    action: 'variant.removed',
    entityType: 'product_variant',
    entityId: variantId,
    before: { productId: variant.productId, name: variant.name },
  });
}
