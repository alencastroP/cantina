import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, money, nullableMoney, primaryId, timestamps } from './_columns';
import { tenantId } from './_tenant';
import { productAvailabilityEnum, stockModeEnum } from './enums';

/**
 * Catálogo (§4.4 do PLAN.md).
 *
 * P13: todo produto tem AO MENOS UMA variação, mesmo quando a vitrine não
 * mostra escolha nenhuma. Preço, receita, custo e estoque penduram sempre na
 * variação — nunca no produto. É o que evita dois caminhos paralelos de
 * precificação e de baixa de estoque no sistema inteiro.
 */

export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('categories_tenant_slug_uq').on(table.tenantId, table.slug),
    index('categories_tenant_position_idx').on(table.tenantId, table.position),
  ],
);

export const products = pgTable(
  'products',
  {
    id: primaryId(),
    tenantId: tenantId(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),

    /**
     * D9. `tracked`   — conta unidades (refrigerante revendido, bolo pronto).
     *     `on_demand` — disponível enquanto os insumos da receita permitirem.
     */
    stockMode: stockModeEnum('stock_mode').notNull().default('on_demand'),
    availableFor: productAvailabilityEnum('available_for').notNull().default('both'),

    active: boolean('active').notNull().default(true),
    /** Pausa temporária na vitrine ("acabou hoje"), sem desativar o cadastro. */
    pausedUntil: timestamp('paused_until', { withTimezone: true, mode: 'date' }),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('products_tenant_slug_uq').on(table.tenantId, table.slug),
    index('products_tenant_category_idx').on(table.tenantId, table.categoryId, table.position),
    index('products_tenant_active_idx').on(table.tenantId, table.active),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: primaryId(),
    tenantId: tenantId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** "Padrão" quando o produto não tem variação visível. */
    name: text('name').notNull().default('Padrão'),
    sku: text('sku'),
    priceCents: money('price_cents'),
    /** Preço "de", riscado na vitrine. */
    compareAtPriceCents: nullableMoney('compare_at_price_cents'),
    isDefault: boolean('is_default').notNull().default(false),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (table) => [
    index('product_variants_product_idx').on(table.tenantId, table.productId, table.position),
    uniqueIndex('product_variants_tenant_sku_uq').on(table.tenantId, table.sku),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: primaryId(),
    tenantId: tenantId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alt: text('alt'),
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('product_images_product_idx').on(table.tenantId, table.productId)],
);

/* --- Relações ------------------------------------------------------------- */

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  images: many(productImages),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));
