import {
  availabilityDays,
  preorderItems,
  preorders,
  type Executor,
} from '@cantina/db';
import { and, asc, count, desc, eq, gte, lt, lte, or, sql } from 'drizzle-orm';

/** Encomendas (§4.8 do PLAN.md). */

export type PreorderRow = typeof preorders.$inferSelect;
export type PreorderItemRow = typeof preorderItems.$inferSelect;

export async function findById(tx: Executor, id: string): Promise<PreorderRow | null> {
  const rows = await tx.select().from(preorders).where(eq(preorders.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Trava a encomenda: transições concorrentes serializam aqui. */
export async function lockById(tx: Executor, id: string): Promise<PreorderRow | null> {
  const rows = await tx
    .select()
    .from(preorders)
    .where(eq(preorders.id, id))
    .limit(1)
    .for('update');
  return rows[0] ?? null;
}

export async function findByIdempotencyKey(
  tx: Executor,
  key: string,
): Promise<PreorderRow | null> {
  const rows = await tx
    .select()
    .from(preorders)
    .where(eq(preorders.idempotencyKey, key))
    .limit(1);
  return rows[0] ?? null;
}

/** Acompanhamento público: código + telefone, igual ao pedido de delivery (D4). */
export async function findByCodeAndPhone(
  tx: Executor,
  code: number,
  phone: string,
): Promise<PreorderRow | null> {
  const rows = await tx
    .select()
    .from(preorders)
    .where(and(eq(preorders.code, code), eq(preorders.customerPhoneSnapshot, phone)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListFilters {
  cursor?: string | undefined;
  limit: number;
  status?: PreorderRow['status'] | undefined;
  customerId?: string | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
  q?: string | undefined;
}

export async function list(tx: Executor, filters: ListFilters): Promise<PreorderRow[]> {
  const where = [];
  if (filters.cursor) where.push(lt(preorders.id, filters.cursor));
  if (filters.status) where.push(eq(preorders.status, filters.status));
  if (filters.customerId) where.push(eq(preorders.customerId, filters.customerId));
  if (filters.dueFrom) where.push(gte(preorders.dueDate, filters.dueFrom));
  if (filters.dueTo) where.push(lte(preorders.dueDate, filters.dueTo));

  if (filters.q) {
    const asNumber = Number.parseInt(filters.q, 10);
    const byName = sql`${preorders.customerNameSnapshot} ilike ${`%${filters.q}%`}`;
    where.push(Number.isNaN(asNumber) ? byName : or(eq(preorders.code, asNumber), byName)!);
  }

  return tx
    .select()
    .from(preorders)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(preorders.id))
    .limit(filters.limit);
}

/**
 * Coluna do board, ordenada pela DATA DE ENTREGA.
 *
 * Diferente do delivery, onde a fila é por ordem de chegada: numa encomenda o
 * que aperta é a data combinada. O que vence amanhã vem antes do que foi
 * pedido antes mas é para o mês que vem.
 */
export async function listByStatus(
  tx: Executor,
  status: PreorderRow['status'],
  limit: number,
): Promise<PreorderRow[]> {
  return tx
    .select()
    .from(preorders)
    .where(eq(preorders.status, status))
    .orderBy(asc(preorders.dueDate), asc(preorders.placedAt))
    .limit(limit);
}

export async function countByStatus(tx: Executor): Promise<Map<string, number>> {
  const rows = await tx
    .select({ status: preorders.status, total: count() })
    .from(preorders)
    .groupBy(preorders.status);
  return new Map(rows.map((row) => [row.status, row.total]));
}

export async function listItems(tx: Executor, preorderId: string): Promise<PreorderItemRow[]> {
  return tx
    .select()
    .from(preorderItems)
    .where(eq(preorderItems.preorderId, preorderId))
    .orderBy(asc(preorderItems.id));
}

export async function insert(
  tx: Executor,
  values: typeof preorders.$inferInsert,
): Promise<PreorderRow> {
  const rows = await tx.insert(preorders).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar a encomenda.');
  return created;
}

export async function insertItems(
  tx: Executor,
  values: (typeof preorderItems.$inferInsert)[],
): Promise<PreorderItemRow[]> {
  if (values.length === 0) return [];
  return tx.insert(preorderItems).values(values).returning();
}

export async function update(
  tx: Executor,
  id: string,
  patch: Partial<typeof preorders.$inferInsert>,
): Promise<PreorderRow | null> {
  const rows = await tx.update(preorders).set(patch).where(eq(preorders.id, id)).returning();
  return rows[0] ?? null;
}

export async function findExpiredPending(
  tx: Executor,
  limit: number,
): Promise<PreorderRow[]> {
  return tx
    .select()
    .from(preorders)
    .where(and(eq(preorders.status, 'pending'), lt(preorders.expiresAt, new Date())))
    .orderBy(asc(preorders.expiresAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Calendário                                                                  */
/* -------------------------------------------------------------------------- */

export interface CalendarRow {
  id: string;
  code: number;
  customerName: string | null;
  status: PreorderRow['status'];
  totalCents: number;
  dueDate: string;
  dueTime: string | null;
}

export async function listForCalendar(
  tx: Executor,
  from: string,
  to: string,
): Promise<CalendarRow[]> {
  return tx
    .select({
      id: preorders.id,
      code: preorders.code,
      customerName: preorders.customerNameSnapshot,
      status: preorders.status,
      totalCents: preorders.totalCents,
      dueDate: preorders.dueDate,
      dueTime: preorders.dueTime,
    })
    .from(preorders)
    .where(
      and(
        gte(preorders.dueDate, from),
        lte(preorders.dueDate, to),
        // Cancelada não ocupa espaço no calendário — a vaga já foi devolvida.
        sql`${preorders.status} <> 'canceled'`,
      ),
    )
    .orderBy(asc(preorders.dueDate), asc(preorders.code));
}

export async function listDayCounters(tx: Executor, from: string, to: string) {
  return tx
    .select({
      date: availabilityDays.date,
      capacity: availabilityDays.capacity,
      usedCount: availabilityDays.usedCount,
      reservedCount: availabilityDays.reservedCount,
    })
    .from(availabilityDays)
    .where(and(gte(availabilityDays.date, from), lte(availabilityDays.date, to)));
}
