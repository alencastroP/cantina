import { calendarReminders, users, type Executor } from '@cantina/db';
import { and, asc, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * Lembretes do calendário.
 *
 * O nome de quem cuida e de quem escreveu vem por JOIN em `users`, como o
 * nome do insumo vem para a receita: a tela lista vinte lembretes e não pode
 * pedir vinte nomes. A tabela continua tendo um dono só — este módulo.
 */

export type ReminderInsert = typeof calendarReminders.$inferInsert;

export interface ReminderRow {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  time: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  doneAt: Date | null;
  createdAt: Date;
}

const assignee = alias(users, 'assignee');
const author = alias(users, 'author');

function selectReminders(tx: Executor) {
  return tx
    .select({
      id: calendarReminders.id,
      title: calendarReminders.title,
      notes: calendarReminders.notes,
      date: calendarReminders.date,
      time: calendarReminders.time,
      assigneeUserId: calendarReminders.assigneeUserId,
      assigneeName: assignee.name,
      createdByUserId: calendarReminders.createdByUserId,
      createdByName: author.name,
      doneAt: calendarReminders.doneAt,
      createdAt: calendarReminders.createdAt,
    })
    .from(calendarReminders)
    .leftJoin(assignee, eq(assignee.id, calendarReminders.assigneeUserId))
    .leftJoin(author, eq(author.id, calendarReminders.createdByUserId));
}

export async function findById(tx: Executor, id: string): Promise<ReminderRow | null> {
  const rows = await selectReminders(tx).where(eq(calendarReminders.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Lembretes do intervalo. Com `userId`, só os daquela pessoa — atribuídos a
 * ela OU escritos por ela: "o que é meu" inclui o que eu pedi a alguém.
 */
export async function listInRange(
  tx: Executor,
  from: string,
  to: string,
  userId?: string,
): Promise<ReminderRow[]> {
  const where: SQL[] = [gte(calendarReminders.date, from), lte(calendarReminders.date, to)];
  if (userId) {
    where.push(
      or(
        eq(calendarReminders.assigneeUserId, userId),
        eq(calendarReminders.createdByUserId, userId),
      )!,
    );
  }

  return selectReminders(tx)
    .where(and(...where))
    .orderBy(
      asc(calendarReminders.date),
      // Sem hora vale para o dia inteiro, e vem antes dos que têm hora.
      sql`${calendarReminders.time} asc nulls first`,
      asc(calendarReminders.id),
    );
}

export async function insert(tx: Executor, values: ReminderInsert): Promise<string> {
  const rows = await tx
    .insert(calendarReminders)
    .values(values)
    .returning({ id: calendarReminders.id });
  const created = rows[0];
  if (!created) throw new Error('Falha ao criar o lembrete.');
  return created.id;
}

export async function update(
  tx: Executor,
  id: string,
  patch: Partial<ReminderInsert>,
): Promise<boolean> {
  if (Object.keys(patch).length === 0) return true;
  const rows = await tx
    .update(calendarReminders)
    .set(patch)
    .where(eq(calendarReminders.id, id))
    .returning({ id: calendarReminders.id });
  return rows.length > 0;
}

export async function remove(tx: Executor, id: string): Promise<void> {
  await tx.delete(calendarReminders).where(eq(calendarReminders.id, id));
}

/** Só gente ativa da equipe recebe lembrete. */
export async function isActiveUser(tx: Executor, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, 'active'), isNull(users.deletedAt)))
    .limit(1);
  return rows.length > 0;
}
