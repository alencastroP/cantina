import {
  customerAddresses,
  customers,
  ordersUnified,
  type Executor,
} from '@cantina/db';
import { and, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';

/** Clientes, endereços e histórico (§4.3 do PLAN.md). */

export type CustomerRow = typeof customers.$inferSelect;
export type AddressRow = typeof customerAddresses.$inferSelect;

export interface ListCustomersFilters {
  cursor?: string | undefined;
  limit: number;
  q?: string | undefined;
  recent?: boolean | undefined;
}

export async function listCustomers(
  tx: Executor,
  filters: ListCustomersFilters,
): Promise<CustomerRow[]> {
  const where = [isNull(customers.deletedAt)];

  if (filters.q) {
    // Uma busca só para nome e telefone: quem atende digita o que tiver na
    // mão, e obrigar a escolher o campo antes é atrito no meio do pedido.
    const term = `%${filters.q}%`;
    const digits = filters.q.replace(/\D/g, '');
    where.push(
      digits.length >= 3
        ? or(sql`${customers.name} ilike ${term}`, sql`${customers.phone} like ${`%${digits}%`}`)!
        : sql`${customers.name} ilike ${term}`,
    );
  }

  if (filters.recent) {
    // Cursor por id não serve quando a ordem é por atividade; esta listagem
    // é a de "quem comprou por último" e vai sem paginação profunda.
    return tx
      .select()
      .from(customers)
      .where(and(...where))
      .orderBy(sql`${customers.lastOrderAt} desc nulls last`)
      .limit(filters.limit);
  }

  if (filters.cursor) where.push(lt(customers.id, filters.cursor));

  return tx
    .select()
    .from(customers)
    .where(and(...where))
    .orderBy(desc(customers.id))
    .limit(filters.limit);
}

export async function findCustomerById(
  tx: Executor,
  customerId: string,
): Promise<CustomerRow | null> {
  const rows = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCustomerByPhone(
  tx: Executor,
  phone: string,
): Promise<CustomerRow | null> {
  const rows = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.phone, phone), isNull(customers.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertCustomer(
  tx: Executor,
  values: typeof customers.$inferInsert,
): Promise<CustomerRow> {
  const rows = await tx.insert(customers).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o cliente.');
  return created;
}

export async function updateCustomer(
  tx: Executor,
  customerId: string,
  patch: Partial<typeof customers.$inferInsert>,
): Promise<CustomerRow | null> {
  const rows = await tx
    .update(customers)
    .set(patch)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteCustomer(tx: Executor, customerId: string): Promise<void> {
  await tx.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, customerId));
}

/* -------------------------------------------------------------------------- */
/* Estatísticas                                                                */
/* -------------------------------------------------------------------------- */

export interface CustomerStats {
  ordersCount: number;
  totalSpentCents: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

/**
 * Recalcula os agregados a partir dos pedidos.
 *
 * Recomputar em vez de incrementar é escolha deliberada: incremento acumula
 * drift a cada cancelamento, reembolso ou correção de valor, e o número que
 * o lojista vê passa a divergir do histórico sem ninguém notar. Um cliente
 * de negócio pequeno tem dezenas de pedidos e a consulta é indexada — a
 * correção garantida vale mais que a microtimização.
 *
 * Pedidos cancelados não contam; `total_spent` soma só o que foi concluído.
 */
export async function computeCustomerStats(
  tx: Executor,
  customerId: string,
): Promise<CustomerStats> {
  const rows = await tx
    .select({
      ordersCount: sql<number>`count(*) filter (where ${ordersUnified.canceledAt} is null)`,
      totalSpentCents: sql<number>`coalesce(sum(${ordersUnified.totalCents}) filter (where ${ordersUnified.completedAt} is not null), 0)`,
      firstOrderAt: sql<Date | null>`min(${ordersUnified.placedAt}) filter (where ${ordersUnified.canceledAt} is null)`,
      lastOrderAt: sql<Date | null>`max(${ordersUnified.placedAt}) filter (where ${ordersUnified.canceledAt} is null)`,
    })
    .from(ordersUnified)
    .where(eq(ordersUnified.customerId, customerId));

  const stats = rows[0];
  return {
    ordersCount: Number(stats?.ordersCount ?? 0),
    totalSpentCents: Number(stats?.totalSpentCents ?? 0),
    // `min`/`max` sobre a view vêm como string do driver, não `Date` — apesar
    // do tipo declarado acima. `saveCustomerStats` grava isso de volta num
    // timestamp, que exige um `Date` de verdade.
    firstOrderAt: stats?.firstOrderAt ? new Date(stats.firstOrderAt) : null,
    lastOrderAt: stats?.lastOrderAt ? new Date(stats.lastOrderAt) : null,
  };
}

export async function saveCustomerStats(
  tx: Executor,
  customerId: string,
  stats: CustomerStats,
): Promise<void> {
  await tx.update(customers).set(stats).where(eq(customers.id, customerId));
}

/* -------------------------------------------------------------------------- */
/* Histórico                                                                   */
/* -------------------------------------------------------------------------- */

export interface CustomerOrderRow {
  id: string;
  kind: string;
  code: number;
  status: string;
  fulfillment: string;
  paymentStatus: string;
  totalCents: number;
  placedAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
  dueDate: string | null;
}

export async function listCustomerOrders(
  tx: Executor,
  customerId: string,
  options: { cursor?: string | undefined; limit: number },
): Promise<CustomerOrderRow[]> {
  const where = [eq(ordersUnified.customerId, customerId)];
  if (options.cursor) where.push(lt(ordersUnified.id, options.cursor));

  return tx
    .select({
      id: ordersUnified.id,
      kind: ordersUnified.kind,
      code: ordersUnified.code,
      status: ordersUnified.status,
      fulfillment: ordersUnified.fulfillment,
      paymentStatus: ordersUnified.paymentStatus,
      totalCents: ordersUnified.totalCents,
      placedAt: ordersUnified.placedAt,
      completedAt: ordersUnified.completedAt,
      canceledAt: ordersUnified.canceledAt,
      dueDate: ordersUnified.dueDate,
    })
    .from(ordersUnified)
    // UUID v7 é ordenável no tempo (P4), então o id serve de cursor mesmo na
    // união de duas tabelas — sem ele, paginar sobre `UNION ALL` exigiria
    // ordenar por data com desempate instável.
    .where(and(...where))
    .orderBy(desc(ordersUnified.id))
    .limit(options.limit);
}

/* -------------------------------------------------------------------------- */
/* Endereços                                                                   */
/* -------------------------------------------------------------------------- */

export async function listAddresses(
  tx: Executor,
  customerId: string,
): Promise<AddressRow[]> {
  return tx
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        isNull(customerAddresses.deletedAt),
      ),
    )
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.id));
}

export async function findAddressById(
  tx: Executor,
  addressId: string,
): Promise<AddressRow | null> {
  const rows = await tx
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), isNull(customerAddresses.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertAddress(
  tx: Executor,
  values: typeof customerAddresses.$inferInsert,
): Promise<AddressRow> {
  const rows = await tx.insert(customerAddresses).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o endereço.');
  return created;
}

export async function updateAddress(
  tx: Executor,
  addressId: string,
  patch: Partial<typeof customerAddresses.$inferInsert>,
): Promise<AddressRow | null> {
  const rows = await tx
    .update(customerAddresses)
    .set(patch)
    .where(and(eq(customerAddresses.id, addressId), isNull(customerAddresses.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteAddress(tx: Executor, addressId: string): Promise<void> {
  await tx
    .update(customerAddresses)
    .set({ deletedAt: new Date(), isDefault: false })
    .where(eq(customerAddresses.id, addressId));
}

export async function clearDefaultAddress(
  tx: Executor,
  customerId: string,
  exceptAddressId: string,
): Promise<void> {
  await tx
    .update(customerAddresses)
    .set({ isDefault: false })
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        ne(customerAddresses.id, exceptAddressId),
      ),
    );
}

/** LGPD (D24): endereço é dado pessoal e some junto com o cadastro. */
export async function anonymizeAddresses(tx: Executor, customerId: string): Promise<number> {
  const rows = await tx
    .update(customerAddresses)
    .set({ deletedAt: new Date(), isDefault: false })
    .where(eq(customerAddresses.customerId, customerId))
    .returning({ id: customerAddresses.id });
  return rows.length;
}
