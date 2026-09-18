import {
  businessHours,
  categories,
  deliveryOrderItems,
  deliveryOrders,
  deliveryZones,
  productVariants,
  products,
  type Executor,
} from '@cantina/db';
import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

/**
 * Consultas da vitrine (§6.1 do PLAN.md).
 *
 * Tudo aqui é público, então as projeções são deliberadamente magras: custo,
 * margem, fornecedor e saldo interno não saem destas funções. O que a vitrine
 * não busca, ela não pode vazar.
 */

export interface MenuRow {
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  categoryPosition: number;
  productId: string;
  productSlug: string;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
  productPosition: number;
  variantId: string;
  variantName: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  variantPosition: number;
}

/**
 * Cardápio inteiro numa consulta.
 *
 * Sem cursor: o cliente vê o cardápio completo de uma vez, e paginar uma
 * lista que a pessoa vai rolar inteira só adiciona latência. A ordem é a que
 * o lojista definiu — posição da categoria, depois do produto.
 */
export async function listMenu(
  tx: Executor,
  availableFor: 'delivery' | 'preorder',
): Promise<MenuRow[]> {
  return tx
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      categorySlug: categories.slug,
      categoryPosition: sql<number>`coalesce(${categories.position}, 9999)`,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productDescription: products.description,
      productImageUrl: products.imageUrl,
      productPosition: products.position,
      variantId: productVariants.id,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      compareAtPriceCents: productVariants.compareAtPriceCents,
      variantPosition: productVariants.position,
    })
    .from(products)
    .innerJoin(
      productVariants,
      and(
        eq(productVariants.productId, products.id),
        eq(productVariants.active, true),
        isNull(productVariants.deletedAt),
      ),
    )
    .leftJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.active, true)),
    )
    .where(
      and(
        eq(products.active, true),
        isNull(products.deletedAt),
        inArray(products.availableFor, [availableFor, 'both']),
        // Pausa temporária ("acabou hoje") tira da vitrine sem mexer no
        // cadastro. Já vencida, o produto volta sozinho.
        or(isNull(products.pausedUntil), sql`${products.pausedUntil} <= now()`)!,
      ),
    )
    .orderBy(
      asc(sql`coalesce(${categories.position}, 9999)`),
      asc(products.position),
      asc(productVariants.position),
    );
}

export async function findProductBySlug(
  tx: Executor,
  slug: string,
): Promise<MenuRow[]> {
  return tx
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      categorySlug: categories.slug,
      categoryPosition: sql<number>`coalesce(${categories.position}, 9999)`,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productDescription: products.description,
      productImageUrl: products.imageUrl,
      productPosition: products.position,
      variantId: productVariants.id,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      compareAtPriceCents: productVariants.compareAtPriceCents,
      variantPosition: productVariants.position,
    })
    .from(products)
    .innerJoin(
      productVariants,
      and(
        eq(productVariants.productId, products.id),
        eq(productVariants.active, true),
        isNull(productVariants.deletedAt),
      ),
    )
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.active, true), isNull(products.deletedAt)))
    .orderBy(asc(productVariants.position));
}

/* -------------------------------------------------------------------------- */
/* Horários e entrega                                                          */
/* -------------------------------------------------------------------------- */

export async function listStoreHours(tx: Executor) {
  return tx
    .select({
      weekday: businessHours.weekday,
      opensAt: businessHours.opensAt,
      closesAt: businessHours.closesAt,
    })
    .from(businessHours)
    .where(eq(businessHours.scope, 'store'))
    .orderBy(asc(businessHours.weekday), asc(businessHours.opensAt));
}

export async function listActiveZones(tx: Executor) {
  return tx
    .select({
      id: deliveryZones.id,
      name: deliveryZones.name,
      neighborhood: deliveryZones.neighborhood,
      feeCents: deliveryZones.feeCents,
      minOrderCents: deliveryZones.minOrderCents,
      etaMinutes: deliveryZones.etaMinutes,
    })
    .from(deliveryZones)
    .where(and(eq(deliveryZones.active, true), eq(deliveryZones.kind, 'neighborhood')))
    .orderBy(asc(deliveryZones.feeCents));
}

export async function findZoneByNeighborhood(tx: Executor, neighborhood: string) {
  const rows = await tx
    .select({
      id: deliveryZones.id,
      name: deliveryZones.name,
      neighborhood: deliveryZones.neighborhood,
      feeCents: deliveryZones.feeCents,
      minOrderCents: deliveryZones.minOrderCents,
      etaMinutes: deliveryZones.etaMinutes,
    })
    .from(deliveryZones)
    .where(
      and(
        eq(deliveryZones.active, true),
        // `ilike` sem curinga: comparação exata, mas sem diferenciar
        // maiúsculas — quem digita "centro" e quem digita "Centro" mora no
        // mesmo bairro.
        ilike(deliveryZones.neighborhood, neighborhood),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Acompanhamento                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Busca por código E telefone, na mesma consulta.
 *
 * Os dois no `where` em vez de buscar por código e comparar depois: assim não
 * existe caminho no código em que o pedido seja carregado antes da conferência.
 */
export async function findOrderForTracking(tx: Executor, code: number, phone: string) {
  const rows = await tx
    .select()
    .from(deliveryOrders)
    .where(
      and(eq(deliveryOrders.code, code), eq(deliveryOrders.customerPhoneSnapshot, phone)),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listOrderItems(tx: Executor, orderId: string) {
  return tx
    .select({
      productName: deliveryOrderItems.productNameSnapshot,
      variantName: deliveryOrderItems.variantNameSnapshot,
      qty: deliveryOrderItems.qty,
      totalCents: deliveryOrderItems.totalCents,
      notes: deliveryOrderItems.notes,
    })
    .from(deliveryOrderItems)
    .where(eq(deliveryOrderItems.orderId, orderId))
    .orderBy(asc(deliveryOrderItems.id));
}
