import {
  financeAccounts,
  financeCategories,
  financeEntries,
  financeRecurrences,
  type Executor,
} from '@cantina/db';
import { and, asc, desc, eq, gte, ilike, isNull, lt, lte, or, sql } from 'drizzle-orm';

/** Financeiro (§4.10 do PLAN.md, D20). */

export type EntryRow = typeof financeEntries.$inferSelect;
export type AccountRow = typeof financeAccounts.$inferSelect;
export type CategoryRow = typeof financeCategories.$inferSelect;
export type RecurrenceRow = typeof financeRecurrences.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Contas                                                                      */
/* -------------------------------------------------------------------------- */

export interface AccountWithBalance extends AccountRow {
  balanceCents: number;
}

/**
 * Saldo = abertura + entradas pagas − saídas pagas, naquela conta.
 *
 * Só o que foi PAGO conta: um boleto agendado não tirou dinheiro do caixa
 * ainda, e somá-lo aqui faria o saldo mentir para menos.
 */
export async function listAccounts(tx: Executor): Promise<AccountWithBalance[]> {
  return tx
    .select({
      id: financeAccounts.id,
      tenantId: financeAccounts.tenantId,
      name: financeAccounts.name,
      kind: financeAccounts.kind,
      openingBalanceCents: financeAccounts.openingBalanceCents,
      isDefault: financeAccounts.isDefault,
      active: financeAccounts.active,
      createdAt: financeAccounts.createdAt,
      updatedAt: financeAccounts.updatedAt,
      deletedAt: financeAccounts.deletedAt,
      balanceCents: sql<number>`
        ${financeAccounts.openingBalanceCents} + coalesce((
          select sum(
            case when ${financeEntries.direction} = 'in'
                 then ${financeEntries.paidAmountCents}
                 else -${financeEntries.paidAmountCents} end
          )
          from ${financeEntries}
          where ${financeEntries.accountId} = ${financeAccounts.id}
            and ${financeEntries.paidAt} is not null
            and ${financeEntries.deletedAt} is null
        ), 0)`,
    })
    .from(financeAccounts)
    .where(isNull(financeAccounts.deletedAt))
    .orderBy(desc(financeAccounts.isDefault), asc(financeAccounts.name));
}

export async function insertAccount(
  tx: Executor,
  values: typeof financeAccounts.$inferInsert,
): Promise<AccountRow> {
  const rows = await tx.insert(financeAccounts).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar a conta.');
  return created;
}

export async function findDefaultAccount(tx: Executor): Promise<AccountRow | null> {
  const rows = await tx
    .select()
    .from(financeAccounts)
    .where(and(eq(financeAccounts.isDefault, true), isNull(financeAccounts.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Categorias                                                                  */
/* -------------------------------------------------------------------------- */

export async function listCategories(tx: Executor): Promise<CategoryRow[]> {
  return tx
    .select()
    .from(financeCategories)
    .where(isNull(financeCategories.deletedAt))
    .orderBy(asc(financeCategories.direction), asc(financeCategories.name));
}

export async function insertCategory(
  tx: Executor,
  values: typeof financeCategories.$inferInsert,
): Promise<CategoryRow> {
  const rows = await tx.insert(financeCategories).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar a categoria.');
  return created;
}

/**
 * Encontra ou cria a categoria padrão de um fluxo automático.
 *
 * Pedido concluído precisa cair em algum lugar; sem isso o lançamento nasceria
 * sem categoria e o relatório por categoria teria um buraco silencioso.
 */
export async function findOrCreateCategory(
  tx: Executor,
  tenantId: string,
  direction: 'in' | 'out',
  name: string,
): Promise<CategoryRow> {
  const rows = await tx
    .select()
    .from(financeCategories)
    .where(
      and(
        eq(financeCategories.direction, direction),
        ilike(financeCategories.name, name),
        isNull(financeCategories.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? insertCategory(tx, { tenantId, direction, name });
}

/* -------------------------------------------------------------------------- */
/* Lançamentos                                                                 */
/* -------------------------------------------------------------------------- */

export interface EntryWithNames extends EntryRow {
  categoryName: string | null;
  accountName: string | null;
}

const entryColumns = {
  id: financeEntries.id,
  tenantId: financeEntries.tenantId,
  direction: financeEntries.direction,
  categoryId: financeEntries.categoryId,
  accountId: financeEntries.accountId,
  description: financeEntries.description,
  amountCents: financeEntries.amountCents,
  dueDate: financeEntries.dueDate,
  paidAt: financeEntries.paidAt,
  paidAmountCents: financeEntries.paidAmountCents,
  status: financeEntries.status,
  source: financeEntries.source,
  sourceId: financeEntries.sourceId,
  recurrenceId: financeEntries.recurrenceId,
  attachmentUrl: financeEntries.attachmentUrl,
  notes: financeEntries.notes,
  createdByUserId: financeEntries.createdByUserId,
  createdAt: financeEntries.createdAt,
  updatedAt: financeEntries.updatedAt,
  deletedAt: financeEntries.deletedAt,
  categoryName: financeCategories.name,
  accountName: financeAccounts.name,
};

export interface ListEntriesFilters {
  cursor?: string | undefined;
  limit: number;
  direction?: 'in' | 'out' | undefined;
  status?: 'open' | 'paid' | 'overdue' | 'canceled' | undefined;
  categoryId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  today: string;
}

export async function listEntries(
  tx: Executor,
  filters: ListEntriesFilters,
): Promise<EntryWithNames[]> {
  const where = [isNull(financeEntries.deletedAt)];
  if (filters.cursor) where.push(lt(financeEntries.id, filters.cursor));
  if (filters.direction) where.push(eq(financeEntries.direction, filters.direction));
  if (filters.categoryId) where.push(eq(financeEntries.categoryId, filters.categoryId));
  if (filters.from) where.push(gte(financeEntries.dueDate, filters.from));
  if (filters.to) where.push(lte(financeEntries.dueDate, filters.to));
  if (filters.q) where.push(ilike(financeEntries.description, `%${filters.q}%`));

  // `overdue` é derivado: aberto e vencido. Não existe coluna com esse valor.
  if (filters.status === 'overdue') {
    where.push(eq(financeEntries.status, 'open'));
    where.push(lt(financeEntries.dueDate, filters.today));
  } else if (filters.status) {
    where.push(eq(financeEntries.status, filters.status));
  }

  return tx
    .select(entryColumns)
    .from(financeEntries)
    .leftJoin(financeCategories, eq(financeEntries.categoryId, financeCategories.id))
    .leftJoin(financeAccounts, eq(financeEntries.accountId, financeAccounts.id))
    .where(and(...where))
    .orderBy(desc(financeEntries.dueDate), desc(financeEntries.id))
    .limit(filters.limit);
}

export async function findEntryById(
  tx: Executor,
  id: string,
): Promise<EntryWithNames | null> {
  const rows = await tx
    .select(entryColumns)
    .from(financeEntries)
    .leftJoin(financeCategories, eq(financeEntries.categoryId, financeCategories.id))
    .leftJoin(financeAccounts, eq(financeEntries.accountId, financeAccounts.id))
    .where(and(eq(financeEntries.id, id), isNull(financeEntries.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertEntry(
  tx: Executor,
  values: typeof financeEntries.$inferInsert,
): Promise<EntryRow> {
  const rows = await tx.insert(financeEntries).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o lançamento.');
  return created;
}

export async function updateEntry(
  tx: Executor,
  id: string,
  patch: Partial<typeof financeEntries.$inferInsert>,
): Promise<EntryRow | null> {
  const rows = await tx
    .update(financeEntries)
    .set(patch)
    .where(and(eq(financeEntries.id, id), isNull(financeEntries.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function softDeleteEntry(tx: Executor, id: string): Promise<void> {
  await tx
    .update(financeEntries)
    .set({ deletedAt: new Date(), status: 'canceled' })
    .where(eq(financeEntries.id, id));
}

/* -------------------------------------------------------------------------- */
/* Fluxo de caixa                                                              */
/* -------------------------------------------------------------------------- */

export interface CashflowRow {
  date: string;
  inCents: number;
  outCents: number;
}

/**
 * Movimento por dia no intervalo.
 *
 * A data usada é o VENCIMENTO, não o pagamento: a projeção precisa saber
 * quando o dinheiro entra ou sai, e o que já foi pago tem vencimento no
 * passado de qualquer jeito.
 */
export async function cashflowByDay(
  tx: Executor,
  from: string,
  to: string,
): Promise<CashflowRow[]> {
  return tx
    .select({
      date: financeEntries.dueDate,
      inCents: sql<number>`coalesce(sum(case when ${financeEntries.direction} = 'in' then coalesce(nullif(${financeEntries.paidAmountCents}, 0), ${financeEntries.amountCents}) else 0 end), 0)`,
      outCents: sql<number>`coalesce(sum(case when ${financeEntries.direction} = 'out' then coalesce(nullif(${financeEntries.paidAmountCents}, 0), ${financeEntries.amountCents}) else 0 end), 0)`,
    })
    .from(financeEntries)
    .where(
      and(
        isNull(financeEntries.deletedAt),
        sql`${financeEntries.status} <> 'canceled'`,
        gte(financeEntries.dueDate, from),
        lte(financeEntries.dueDate, to),
      ),
    )
    .groupBy(financeEntries.dueDate)
    .orderBy(asc(financeEntries.dueDate));
}

/** Saldo acumulado antes do início do intervalo — o ponto de partida. */
export async function balanceBefore(tx: Executor, date: string): Promise<number> {
  const accounts = await tx
    .select({ total: sql<number>`coalesce(sum(${financeAccounts.openingBalanceCents}), 0)` })
    .from(financeAccounts)
    .where(isNull(financeAccounts.deletedAt));

  const entries = await tx
    .select({
      total: sql<number>`coalesce(sum(case when ${financeEntries.direction} = 'in' then coalesce(nullif(${financeEntries.paidAmountCents}, 0), ${financeEntries.amountCents}) else -coalesce(nullif(${financeEntries.paidAmountCents}, 0), ${financeEntries.amountCents}) end), 0)`,
    })
    .from(financeEntries)
    .where(
      and(
        isNull(financeEntries.deletedAt),
        sql`${financeEntries.status} <> 'canceled'`,
        lt(financeEntries.dueDate, date),
      ),
    );

  return Number(accounts[0]?.total ?? 0) + Number(entries[0]?.total ?? 0);
}

export async function overdueTotals(
  tx: Executor,
  today: string,
): Promise<{ inCents: number; outCents: number }> {
  const rows = await tx
    .select({
      inCents: sql<number>`coalesce(sum(case when ${financeEntries.direction} = 'in' then ${financeEntries.amountCents} else 0 end), 0)`,
      outCents: sql<number>`coalesce(sum(case when ${financeEntries.direction} = 'out' then ${financeEntries.amountCents} else 0 end), 0)`,
    })
    .from(financeEntries)
    .where(
      and(
        isNull(financeEntries.deletedAt),
        eq(financeEntries.status, 'open'),
        lt(financeEntries.dueDate, today),
      ),
    );

  return {
    inCents: Number(rows[0]?.inCents ?? 0),
    outCents: Number(rows[0]?.outCents ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Recorrências                                                                */
/* -------------------------------------------------------------------------- */

export interface RecurrenceWithCategory extends RecurrenceRow {
  categoryName: string | null;
}

export async function listRecurrences(tx: Executor): Promise<RecurrenceWithCategory[]> {
  return tx
    .select({
      id: financeRecurrences.id,
      tenantId: financeRecurrences.tenantId,
      direction: financeRecurrences.direction,
      categoryId: financeRecurrences.categoryId,
      accountId: financeRecurrences.accountId,
      description: financeRecurrences.description,
      amountCents: financeRecurrences.amountCents,
      frequency: financeRecurrences.frequency,
      nextDueDate: financeRecurrences.nextDueDate,
      endsAt: financeRecurrences.endsAt,
      active: financeRecurrences.active,
      createdAt: financeRecurrences.createdAt,
      updatedAt: financeRecurrences.updatedAt,
      categoryName: financeCategories.name,
    })
    .from(financeRecurrences)
    .leftJoin(financeCategories, eq(financeRecurrences.categoryId, financeCategories.id))
    .orderBy(asc(financeRecurrences.nextDueDate));
}

export async function insertRecurrence(
  tx: Executor,
  values: typeof financeRecurrences.$inferInsert,
): Promise<RecurrenceRow> {
  const rows = await tx.insert(financeRecurrences).values(values).returning();
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar a recorrência.');
  return created;
}

export async function updateRecurrence(
  tx: Executor,
  id: string,
  patch: Partial<typeof financeRecurrences.$inferInsert>,
): Promise<RecurrenceRow | null> {
  const rows = await tx
    .update(financeRecurrences)
    .set(patch)
    .where(eq(financeRecurrences.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteRecurrence(tx: Executor, id: string): Promise<boolean> {
  const rows = await tx
    .delete(financeRecurrences)
    .where(eq(financeRecurrences.id, id))
    .returning({ id: financeRecurrences.id });
  return rows.length > 0;
}

/** Recorrências vencidas que ainda não geraram o próximo lançamento. */
export async function findDueRecurrences(
  tx: Executor,
  today: string,
  limit: number,
): Promise<RecurrenceRow[]> {
  return tx
    .select()
    .from(financeRecurrences)
    .where(
      and(
        eq(financeRecurrences.active, true),
        lte(financeRecurrences.nextDueDate, today),
        or(isNull(financeRecurrences.endsAt), gte(financeRecurrences.endsAt, today))!,
      ),
    )
    .limit(limit);
}
