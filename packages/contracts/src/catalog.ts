import { z } from 'zod';

import {
  cursorQuerySchema,
  positiveCentsSchema,
  slugSchema,
  uuidSchema,
} from './common';

/**
 * Catálogo (§6.4 do PLAN.md).
 *
 * P13 é estrutural no contrato: `createProduct` exige `variants` com ao menos
 * um item. Não existe produto sem variação, então não existe caminho no qual
 * preço, receita e estoque precisem pendurar em dois lugares diferentes.
 */

export const stockModeSchema = z.enum(['tracked', 'on_demand']);
export type StockMode = z.infer<typeof stockModeSchema>;

export const productAvailabilitySchema = z.enum(['delivery', 'preorder', 'both']);

/* -------------------------------------------------------------------------- */
/* Categorias                                                                  */
/* -------------------------------------------------------------------------- */

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  position: z.number().int(),
  active: z.boolean(),
  productCount: z.number().int(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryRequestSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  /** Omitido, é derivado do nome. */
  slug: slugSchema.optional(),
  active: z.boolean().optional(),
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = createCategoryRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

/** Reordenação: a lista chega inteira, na ordem final desejada. */
export const reorderRequestSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(200),
});
export type ReorderRequest = z.infer<typeof reorderRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Variações                                                                   */
/* -------------------------------------------------------------------------- */

export const variantSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  name: z.string(),
  sku: z.string().nullable(),
  priceCents: positiveCentsSchema,
  compareAtPriceCents: positiveCentsSchema.nullable(),
  isDefault: z.boolean(),
  position: z.number().int(),
  active: z.boolean(),
});
export type Variant = z.infer<typeof variantSchema>;

export const createVariantRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60).default('Padrão'),
    sku: z.string().trim().max(40).nullable().optional(),
    priceCents: positiveCentsSchema,
    compareAtPriceCents: positiveCentsSchema.nullable().optional(),
    isDefault: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.compareAtPriceCents == null || value.compareAtPriceCents > value.priceCents,
    {
      message: 'O preço "de" precisa ser maior que o preço de venda.',
      path: ['compareAtPriceCents'],
    },
  );
export type CreateVariantRequest = z.infer<typeof createVariantRequestSchema>;

export const updateVariantRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    sku: z.string().trim().max(40).nullable().optional(),
    priceCents: positiveCentsSchema.optional(),
    compareAtPriceCents: positiveCentsSchema.nullable().optional(),
    isDefault: z.literal(true).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateVariantRequest = z.infer<typeof updateVariantRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Produtos                                                                    */
/* -------------------------------------------------------------------------- */

export const productImageSchema = z.object({
  id: uuidSchema,
  url: z.string().url(),
  alt: z.string().nullable(),
  position: z.number().int(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

export const productSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema.nullable(),
  categoryName: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  stockMode: stockModeSchema,
  availableFor: productAvailabilitySchema,
  active: z.boolean(),
  pausedUntil: z.string().datetime().nullable(),
  position: z.number().int(),
  variants: z.array(variantSchema),
});
export type Product = z.infer<typeof productSchema>;

export const productDetailSchema = productSchema.extend({
  images: z.array(productImageSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const listProductsQuerySchema = cursorQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  active: z.coerce.boolean().optional(),
  availableFor: productAvailabilitySchema.optional(),
  /** Busca por nome. */
  q: z.string().trim().min(2).max(60).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const createProductRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  slug: slugSchema.optional(),
  stockMode: stockModeSchema.default('on_demand'),
  availableFor: productAvailabilitySchema.default('both'),
  active: z.boolean().default(true),
  /** P13: no mínimo uma variação. Produto simples manda uma só, sem nome. */
  variants: z.array(createVariantRequestSchema).min(1).max(30),
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    categoryId: uuidSchema.nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    slug: slugSchema.optional(),
    stockMode: stockModeSchema.optional(),
    availableFor: productAvailabilitySchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

/**
 * Pausa da vitrine — o "acabou hoje".
 *
 * Separada do `active` de propósito: desativar um produto é decisão de
 * cadastro, pausar é decisão de operação, e quem faz uma raramente quer a
 * outra. `pausedUntil: null` despausa.
 */
export const updateAvailabilityRequestSchema = z.object({
  active: z.boolean().optional(),
  pausedUntil: z.string().datetime().nullable().optional(),
});
export type UpdateAvailabilityRequest = z.infer<typeof updateAvailabilityRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Imagens                                                                     */
/* -------------------------------------------------------------------------- */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const uploadUrlRequestSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  contentLength: z.number().int().positive().max(MAX_IMAGE_BYTES),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  expiresInSeconds: z.number().int(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const addProductImageRequestSchema = z.object({
  url: z.string().url(),
  alt: z.string().trim().max(200).nullable().optional(),
});
export type AddProductImageRequest = z.infer<typeof addProductImageRequestSchema>;
