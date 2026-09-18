import {
  customerAddresses,
  customers,
  deliveryOrderItems,
  deliveryOrders,
  productVariants,
  products,
  tenantCounters,
  type Executor,
} from '@cantina/db';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

/** Pedidos de delivery (§4.7 do PLAN.md). */

export type OrderRow = typeof deliveryOrders.$inferSelect;
export type OrderItemRow = typeof deliveryOrderItems.$inferSelect;

/**
 * Próximo código sequencial da empresa (#1, #2, …).
 *
 * `SEQUENCE` do Postgres não serve: ela é global, e o primeiro pedido de cada
 * loja precisa ser o nº 1 dela. O upsert com `RETURNING` é atômico — duas
 * requisições simultâneas recebem números diferentes sem trava explícita.
 */
export async function nextCode(
  tx: Executor,
  tenantId: string,
  scope: 'delivery_order' | 'preorder',
): Promise<number> {
  const rows = await tx
    .insert(tenantCounters)
    .values({ tenantId, scope, lastValue: 1 })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.scope],
      set: { lastValue: sql`${tenantCounters.lastValue} + 1` },
    })
    .returning({ value: tenantCounters.lastValue });

  const value = rows[0]?.value;
  if (value === undefined) throw new Error('Falha ao gerar o código do pedido.');
  return value;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

export async function findOrderById(tx: Executor, orderId: string): Promise<OrderRow | null> {
  const rows = await tx
    .select()
    .from(deliveryOrders)
    .where(eq(deliveryOrders.id, orderId))
    .limit(1);
  return rows[0] ?? null;
}

/** Trava o pedido: transições concorrentes no mesmo pedido serializam aqui. */
export async function lockOrderById(tx: Executor, orderId: string): Promise<OrderRow | null> {
  const rows = await tx
    .select()
    .from(deliveryOrders)
    .where(eq(deliveryOrders.id, orderId))
    .limit(1)
    .for('update');
  return rows[0] ?? null;
}

export async function findOrderByIdempotencyKey(
  tx: Executor,
  key: string,
): Promise<OrderRow | null> {
  const rows = await tx
    .select()
    .from(deliveryOrders)
    .where(eq(deliveryOrders.idempotencyKey, key))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListOrdersFilters {
  cursor?: string | undefined;
  limit: number;
  status?: OrderRow['status'] | undefined;
  customerId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  q?: string | undefined;
}

export async function listOrders(
  tx: Executor,
  filters: ListOrdersFilters,
): Promise<OrderRow[]> {
  const where = [];
  if (filters.cursor) where.push(lt(deliveryOrders.id, filters.cursor));
  if (filters.status) where.push(eq(deliveryOrders.status, filters.status));
  if (filters.customerId) where.push(eq(deliveryOrders.customerId, filters.customerId));
  if (filters.from) where.push(gte(deliveryOrders.placedAt, filters.from));
  if (filters.to) where.push(lte(deliveryOrders.placedAt, filters.to));

  if (filters.q) {
    // Quem atende digita o número do pedido ou o nome do cliente, do jeito
    // que estiver na cabeça — obrigar a escolher o campo é atrito no balcão.
    const asNumber = Number.parseInt(filters.q, 10);
    const byName = sql`${deliveryOrders.customerNameSnapshot} ilike ${`%${filters.q}%`}`;
    where.push(
      Number.isNaN(asNumber) ? byName : or(eq(deliveryOrders.code, asNumber), byName)!,
    );
  }

  return tx
    .select()
    .from(deliveryOrders)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(deliveryOrders.id))
    .limit(filters.limit);
}

/** Pedidos de uma coluna do board, os mais antigos primeiro (fila real). */
export async function listByStatus(
  tx: Executor,
  status: OrderRow['status'],
  limit: number,
): Promise<OrderRow[]> {
  return tx
    .select()
    .from(deliveryOrders)
    .where(eq(deliveryOrders.status, status))
    .orderBy(asc(deliveryOrders.placedAt))
    .limit(limit);
}

export async function countByStatus(tx: Executor): Promise<Map<string, number>> {
  const rows = await tx
    .select({ status: deliveryOrders.status, total: count() })
    .from(deliveryOrders)
    .groupBy(deliveryOrders.status);

  return new Map(rows.map((row) => [row.status, row.total]));
}

export async function listItems(tx: Executor, orderId: string): Promise<OrderItemRow[]> {
  return tx
    .select()
    .from(deliveryOrderItems)
    .where(eq(deliveryOrderItems.orderId, orderId))
    .orderBy(asc(deliveryOrderItems.id));
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

export async function insertOrder(
  tx: Executor,
  values: typeof deliveryOrders.$inferInsert,
): Promise<OrderRow> {
  const rows = await tx.insert(deliveryOrders).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o pedido.');
  return created;
}

export async function insertItems(
  tx: Executor,
  values: (typeof deliveryOrderItems.$inferInsert)[],
): Promise<OrderItemRow[]> {
  if (values.length === 0) return [];
  return tx.insert(deliveryOrderItems).values(values).returning();
}

export async function updateOrder(
  tx: Executor,
  orderId: string,
  patch: Partial<typeof deliveryOrders.$inferInsert>,
): Promise<OrderRow | null> {
  const rows = await tx
    .update(deliveryOrders)
    .set(patch)
    .where(eq(deliveryOrders.id, orderId))
    .returning();
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Apoio                                                                       */
/* -------------------------------------------------------------------------- */

export interface VariantForOrder {
  id: string;
  productName: string;
  variantName: string;
  priceCents: number;
  active: boolean;
  productActive: boolean;
  availableFor: 'delivery' | 'preorder' | 'both';
}

export async function findVariantsForOrder(
  tx: Executor,
  variantIds: string[],
): Promise<Map<string, VariantForOrder>> {
  const output = new Map<string, VariantForOrder>();
  if (variantIds.length === 0) return output;

  const rows = await tx
    .select({
      id: productVariants.id,
      productName: products.name,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      active: productVariants.active,
      productActive: products.active,
      availableFor: products.availableFor,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        inArray(productVariants.id, variantIds),
        isNull(productVariants.deletedAt),
        isNull(products.deletedAt),
      ),
    );

  for (const row of rows) output.set(row.id, row);
  return output;
}

export async function findCustomerForOrder(
  tx: Executor,
  customerId: string,
): Promise<{ id: string; name: string; phone: string } | null> {
  const rows = await tx
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findAddressForOrder(
  tx: Executor,
  addressId: string,
): Promise<typeof customerAddresses.$inferSelect | null> {
  const rows = await tx
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), isNull(customerAddresses.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Pedidos pendentes cuja reserva venceu — alimenta o job de expiração (D14). */
export async function findExpiredPending(
  tx: Executor,
  limit: number,
): Promise<OrderRow[]> {
  return tx
    .select()
    .from(deliveryOrders)
    .where(
      and(
        eq(deliveryOrders.status, 'pending'),
        lt(deliveryOrders.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(deliveryOrders.expiresAt))
    .limit(limit);
}
