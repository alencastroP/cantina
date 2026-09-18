import {
  availabilityDays,
  availabilityExceptions,
  availabilityRules,
  type Executor,
} from '@cantina/db';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

/** Agenda de encomendas (§4.9 do PLAN.md, D10). */

export async function listRules(tx: Executor) {
  return tx
    .select({
      weekday: availabilityRules.weekday,
      isOpen: availabilityRules.isOpen,
      capacity: availabilityRules.capacity,
    })
    .from(availabilityRules)
    .orderBy(asc(availabilityRules.weekday));
}

export async function replaceRules(
  tx: Executor,
  tenantId: string,
  rules: Array<{ weekday: number; isOpen: boolean; capacity: number }>,
): Promise<void> {
  for (const rule of rules) {
    await tx
      .insert(availabilityRules)
      .values({ tenantId, ...rule })
      .onConflictDoUpdate({
        target: [availabilityRules.tenantId, availabilityRules.weekday],
        set: { isOpen: rule.isOpen, capacity: rule.capacity },
      });
  }
}

export async function listExceptions(tx: Executor, from?: string, to?: string) {
  const where = [];
  if (from) where.push(gte(availabilityExceptions.date, from));
  if (to) where.push(lte(availabilityExceptions.date, to));

  return tx
    .select({
      id: availabilityExceptions.id,
      date: availabilityExceptions.date,
      isOpen: availabilityExceptions.isOpen,
      capacity: availabilityExceptions.capacity,
      reason: availabilityExceptions.reason,
    })
    .from(availabilityExceptions)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(availabilityExceptions.date));
}

export async function upsertException(
  tx: Executor,
  values: {
    tenantId: string;
    date: string;
    isOpen: boolean;
    capacity: number | null;
    reason: string | null;
  },
) {
  const rows = await tx
    .insert(availabilityExceptions)
    .values(values)
    .onConflictDoUpdate({
      target: [availabilityExceptions.tenantId, availabilityExceptions.date],
      set: { isOpen: values.isOpen, capacity: values.capacity, reason: values.reason },
    })
    .returning();

  const saved = rows[0];
  if (!saved) throw new Error('Falha ao salvar a exceção de agenda.');
  return saved;
}

export async function deleteException(tx: Executor, id: string): Promise<boolean> {
  const rows = await tx
    .delete(availabilityExceptions)
    .where(eq(availabilityExceptions.id, id))
    .returning({ id: availabilityExceptions.id });
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Dias materializados                                                         */
/* -------------------------------------------------------------------------- */

export async function listDays(tx: Executor, from: string, to: string) {
  return tx
    .select({
      id: availabilityDays.id,
      date: availabilityDays.date,
      capacity: availabilityDays.capacity,
      usedCount: availabilityDays.usedCount,
      reservedCount: availabilityDays.reservedCount,
    })
    .from(availabilityDays)
    .where(and(gte(availabilityDays.date, from), lte(availabilityDays.date, to)))
    .orderBy(asc(availabilityDays.date));
}

/**
 * Materializa o dia com a capacidade derivada de regra + exceção.
 *
 * `capacity` é DERIVADA e por isso é sempre atualizada; `used` e `reserved`
 * são fatos e nunca são tocados aqui. Sem essa distinção, mudar a regra
 * semanal apagaria as reservas já feitas.
 */
export async function ensureDay(
  tx: Executor,
  tenantId: string,
  date: string,
  capacity: number,
): Promise<{ id: string; capacity: number; usedCount: number; reservedCount: number }> {
  const rows = await tx
    .insert(availabilityDays)
    .values({ tenantId, date, capacity })
    .onConflictDoUpdate({
      target: [availabilityDays.tenantId, availabilityDays.date],
      set: { capacity },
    })
    .returning({
      id: availabilityDays.id,
      capacity: availabilityDays.capacity,
      usedCount: availabilityDays.usedCount,
      reservedCount: availabilityDays.reservedCount,
    });

  const day = rows[0];
  if (!day) throw new Error('Falha ao materializar o dia da agenda.');
  return day;
}

/**
 * Reserva de vaga ATÔMICA.
 *
 * A condição está no `WHERE`, não numa leitura anterior: se o dia lotou entre
 * a consulta do cliente e o envio do pedido, o `UPDATE` não casa e devolve
 * zero linhas. Sem isso, dois clientes pegam a última vaga do sábado — e o
 * lojista descobre no dia.
 */
export async function reserveSlot(
  tx: Executor,
  date: string,
): Promise<{ id: string } | null> {
  const rows = await tx
    .update(availabilityDays)
    .set({ reservedCount: sql`${availabilityDays.reservedCount} + 1` })
    .where(
      and(
        eq(availabilityDays.date, date),
        sql`${availabilityDays.reservedCount} + ${availabilityDays.usedCount} < ${availabilityDays.capacity}`,
      ),
    )
    .returning({ id: availabilityDays.id });

  return rows[0] ?? null;
}

/** Reserva vira uso definitivo: a encomenda foi confirmada. */
export async function consumeSlot(tx: Executor, dayId: string): Promise<void> {
  await tx
    .update(availabilityDays)
    .set({
      reservedCount: sql`greatest(${availabilityDays.reservedCount} - 1, 0)`,
      usedCount: sql`${availabilityDays.usedCount} + 1`,
    })
    .where(eq(availabilityDays.id, dayId));
}

/**
 * Devolve a vaga.
 *
 * `fromReserved` diz de qual contador tirar: encomenda ainda pendente estava
 * em `reserved`, confirmada já tinha virado `used`. Tirar do contador errado
 * deixaria a agenda dizendo que há vaga onde não há.
 */
export async function releaseSlot(
  tx: Executor,
  dayId: string,
  fromReserved: boolean,
): Promise<void> {
  await tx
    .update(availabilityDays)
    .set(
      fromReserved
        ? { reservedCount: sql`greatest(${availabilityDays.reservedCount} - 1, 0)` }
        : { usedCount: sql`greatest(${availabilityDays.usedCount} - 1, 0)` },
    )
    .where(eq(availabilityDays.id, dayId));
}
