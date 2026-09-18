import type {
  AddProductImageRequest,
  ProductDetail,
  ProductImage,
  UploadUrlRequest,
  UploadUrlResponse,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { notFound, unprocessable } from '../../http/errors/app-error';
import { storageProvider } from '../../integrations/storage';
import { recordAudit } from '../../shared/audit';
import { logger } from '../../shared/logger';
import * as repository from './catalog.repository';
import { assemble } from './products.service';

/**
 * Imagens de produto (§6.4 do PLAN.md).
 *
 * Duas colunas guardam imagem e a redundância é proposital:
 *   `product_images`     a galeria, ordenável;
 *   `products.image_url` a capa, desnormalizada.
 *
 * O cardápio da vitrine lista dezenas de produtos e não pode fazer join com
 * a galeria para descobrir a foto de cada um. A capa é sempre a primeira da
 * galeria, recalculada a cada mudança — nunca editada à mão.
 */

const MAX_IMAGES_PER_PRODUCT = 8;

function toImage(row: repository.ImageRow): ProductImage {
  return { id: row.id, url: row.url, alt: row.alt, position: row.position };
}

async function refreshCover(tx: Transaction, productId: string): Promise<void> {
  const images = await repository.listImages(tx, productId);
  await repository.updateProduct(tx, productId, { imageUrl: images[0]?.url ?? null });
}

export async function createUploadUrl(
  tx: Transaction,
  tenantId: string,
  productId: string,
  input: UploadUrlRequest,
): Promise<UploadUrlResponse> {
  const product = await repository.findProductById(tx, productId);
  if (!product) throw notFound('Produto não encontrado.');

  return storageProvider.presignUpload({
    tenantId,
    contentType: input.contentType,
    contentLength: input.contentLength,
    folder: 'products',
  });
}

/**
 * Registra a imagem DEPOIS do upload.
 *
 * Duas chamadas em vez de uma porque o arquivo não passa pela API: a
 * primeira assina a URL, o browser sobe direto ao bucket, a segunda grava a
 * referência. Um upload que falha no meio não deixa linha órfã no banco —
 * deixa, no máximo, um arquivo não referenciado no bucket.
 */
export async function addImage(
  tx: Transaction,
  tenantId: string,
  productId: string,
  input: AddProductImageRequest,
): Promise<ProductDetail> {
  const product = await repository.findProductById(tx, productId);
  if (!product) throw notFound('Produto não encontrado.');

  const existing = await repository.listImages(tx, productId);
  if (existing.length >= MAX_IMAGES_PER_PRODUCT) {
    throw unprocessable(`Cada produto aceita no máximo ${MAX_IMAGES_PER_PRODUCT} imagens.`);
  }

  const created = await repository.insertImage(tx, {
    tenantId,
    productId,
    url: input.url,
    alt: input.alt ?? null,
    position: existing.length,
  });

  await refreshCover(tx, productId);

  await recordAudit(tx, {
    tenantId,
    action: 'product.image_added',
    entityType: 'product',
    entityId: productId,
    after: { imageId: created.id },
  });

  return assemble(tx, (await repository.findProductById(tx, productId))!);
}

export async function removeImage(
  tx: Transaction,
  tenantId: string,
  imageId: string,
): Promise<void> {
  const image = await repository.findImageById(tx, imageId);
  if (!image) throw notFound('Imagem não encontrada.');

  await repository.deleteImage(tx, imageId);

  const remaining = await repository.listImages(tx, image.productId);
  await repository.setImagePositions(
    tx,
    remaining.map((row) => row.id),
  );
  await refreshCover(tx, image.productId);

  await recordAudit(tx, {
    tenantId,
    action: 'product.image_removed',
    entityType: 'product',
    entityId: image.productId,
    before: { imageId, url: image.url },
  });

  /**
   * O arquivo no bucket é apagado por último e sem bloquear a resposta.
   *
   * A transação já vai comitar; se o storage estiver fora do ar, insistir
   * faria o usuário perder a operação inteira por causa de um arquivo. O
   * resultado pior possível é um objeto órfão no bucket, que custa centavos.
   */
  void storageProvider.delete(image.url).catch((error: unknown) => {
    logger.warn({ err: error, imageId, url: image.url }, 'Falha ao apagar arquivo do storage');
  });
}

export async function reorderImages(
  tx: Transaction,
  tenantId: string,
  productId: string,
  ids: string[],
): Promise<ProductDetail> {
  const current = await repository.listImages(tx, productId);
  if (current.length === 0) throw notFound('Este produto não tem imagens.');

  const known = new Set(current.map((row) => row.id));
  if (ids.length !== current.length || ids.some((id) => !known.has(id))) {
    throw unprocessable('Envie todas as imagens do produto, na ordem desejada.', {
      expected: current.length,
      received: ids.length,
    });
  }

  await repository.setImagePositions(tx, ids);
  await refreshCover(tx, productId);

  await recordAudit(tx, {
    tenantId,
    action: 'product.images_reordered',
    entityType: 'product',
    entityId: productId,
    after: { count: ids.length },
  });

  return assemble(tx, (await repository.findProductById(tx, productId))!);
}

export { toImage };
