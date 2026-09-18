import {
  MAX_PAGE_SIZE,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarFeed,
  type CalendarFeedQuery,
  type CreateReminderRequest,
  type FinanceEntry,
  type Reminder,
  type UpdateReminderRequest,
  type UserRole,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { forbidden, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import * as financeService from '../finance/finance.service';
import * as availabilityService from '../preorders/availability.service';
import * as preordersService from '../preorders/preorders.service';
import * as repository from './calendar.repository';

/**
 * Calendário da loja.
 *
 * Não tem dado próprio além dos lembretes: encomendas e vencimentos são
 * lidos pelos SERVIÇOS dos módulos donos, nunca pelas tabelas deles. É o que
 * mantém "quem cancela uma encomenda devolve a vaga" num lugar só.
 *
 * O papel decide o que entra. As contas seguem o mesmo recorte das rotas do
 * financeiro (`owner`, `manager`, `finance`); o resto é da equipe toda.
 */

export interface Viewer {
  id: string;
  role: UserRole;
}

const FINANCE_ROLES: readonly UserRole[] = ['owner', 'manager', 'finance'];
/** Editar ou apagar lembrete alheio. Concluir é aberto a todos. */
const EDITOR_ROLES: readonly UserRole[] = ['owner', 'manager'];

/** Um mês costuma ter dezenas de lançamentos; o teto só evita o absurdo. */
const FINANCE_MAX_PAGES = 5;

const KIND_ORDER: Record<CalendarEventKind, number> = {
  reminder: 0,
  preorder: 1,
  finance: 2,
};

export function visibleKinds(role: UserRole): CalendarEventKind[] {
  return FINANCE_ROLES.includes(role)
    ? ['preorder', 'reminder', 'finance']
    : ['preorder', 'reminder'];
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function toReminder(row: repository.ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    date: row.date,
    time: row.time?.slice(0, 5) ?? null,
    assigneeUserId: row.assigneeUserId,
    assigneeName: row.assigneeName,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    doneAt: row.doneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function financeStatusLabel(entry: FinanceEntry): string {
  if (entry.status === 'paid') return entry.direction === 'in' ? 'Recebida' : 'Paga';
  if (entry.status === 'overdue') return 'Vencida';
  return entry.direction === 'in' ? 'A receber' : 'A pagar';
}

async function listFinanceEntries(
  tx: Transaction,
  from: string,
  to: string,
): Promise<FinanceEntry[]> {
  const output: FinanceEntry[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < FINANCE_MAX_PAGES; page += 1) {
    const result = await financeService.listEntries(tx, {
      from,
      to,
      limit: MAX_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    output.push(...result.items.filter((entry) => entry.status !== 'canceled'));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return output;
}

export async function feed(
  tx: Transaction,
  tenantId: string,
  query: CalendarFeedQuery,
  viewer: Viewer,
  timeZone: string,
): Promise<CalendarFeed> {
  const allowed = visibleKinds(viewer.role);
  const requested = query.kinds;
  const kinds = requested ? allowed.filter((kind) => requested.includes(kind)) : allowed;
  const wants = (kind: CalendarEventKind) => kinds.includes(kind);

  const [days, preorders, reminders, entries] = await Promise.all([
    wants('preorder')
      ? availabilityService.getRange(tx, tenantId, query.from, query.to, timeZone)
      : Promise.resolve([]),
    wants('preorder')
      ? preordersService.calendarRange(tx, query.from, query.to)
      : Promise.resolve([]),
    wants('reminder')
      ? repository.listInRange(tx, query.from, query.to, query.userId)
      : Promise.resolve([]),
    wants('finance') ? listFinanceEntries(tx, query.from, query.to) : Promise.resolve([]),
  ]);

  const events: CalendarEvent[] = [
    ...reminders.map((row): CalendarEvent => {
      const reminder = toReminder(row);
      return {
        key: `reminder:${reminder.id}`,
        kind: 'reminder',
        id: reminder.id,
        date: reminder.date,
        time: reminder.time,
        title: reminder.title,
        detail: reminder.notes,
        status: reminder.doneAt ? 'done' : 'open',
        statusLabel: reminder.doneAt ? 'Feito' : null,
        done: reminder.doneAt !== null,
        amountCents: null,
        direction: null,
        userId: reminder.assigneeUserId,
        userName: reminder.assigneeName,
        reminder,
      };
    }),
    ...preorders.map(
      (preorder): CalendarEvent => ({
        key: `preorder:${preorder.id}`,
        kind: 'preorder',
        id: preorder.id,
        date: preorder.dueDate,
        time: preorder.dueTime,
        title: preorder.customerName ?? `Encomenda #${preorder.code}`,
        detail: `#${preorder.code}`,
        status: preorder.status,
        statusLabel: preorder.statusLabel,
        done: preorder.status === 'completed',
        amountCents: preorder.totalCents,
        direction: null,
        userId: null,
        userName: null,
        reminder: null,
      }),
    ),
    ...entries.map(
      (entry): CalendarEvent => ({
        key: `finance:${entry.id}`,
        kind: 'finance',
        id: entry.id,
        date: entry.dueDate,
        time: null,
        title: entry.description,
        detail: entry.categoryName,
        status: entry.status,
        statusLabel: financeStatusLabel(entry),
        done: entry.status === 'paid',
        amountCents: entry.amountCents,
        direction: entry.direction,
        userId: null,
        userName: null,
        reminder: null,
      }),
    ),
  ];

  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? '').localeCompare(b.time ?? '') ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );

  return {
    from: query.from,
    to: query.to,
    kinds: allowed,
    days: days.map((day) => ({
      date: day.date,
      isOpen: day.isOpen,
      capacity: day.capacity,
      taken: day.taken,
      exceptionReason: day.exceptionReason,
    })),
    events,
  };
}

async function getReminder(tx: Transaction, id: string): Promise<Reminder> {
  const row = await repository.findById(tx, id);
  if (!row) throw notFound('Lembrete não encontrado.');
  return toReminder(row);
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

function assertCanEdit(row: repository.ReminderRow, viewer: Viewer): void {
  if (row.createdByUserId === viewer.id || EDITOR_ROLES.includes(viewer.role)) return;
  throw forbidden('Só quem escreveu o lembrete, ou a gerência, pode alterá-lo.');
}

async function assertAssignable(tx: Transaction, userId: string): Promise<void> {
  if (!(await repository.isActiveUser(tx, userId))) {
    throw unprocessable('Essa pessoa não está ativa na equipe.', { assigneeUserId: userId });
  }
}

export async function createReminder(
  tx: Transaction,
  tenantId: string,
  input: CreateReminderRequest,
  viewer: Viewer,
): Promise<Reminder> {
  if (input.assigneeUserId) await assertAssignable(tx, input.assigneeUserId);

  const id = await repository.insert(tx, {
    tenantId,
    title: input.title,
    notes: input.notes ?? null,
    date: input.date,
    time: input.time ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    createdByUserId: viewer.id,
  });

  await recordAudit(tx, {
    tenantId,
    action: 'reminder.created',
    entityType: 'calendar_reminder',
    entityId: id,
    after: { title: input.title, date: input.date, assigneeUserId: input.assigneeUserId ?? null },
  });

  return getReminder(tx, id);
}

export async function updateReminder(
  tx: Transaction,
  tenantId: string,
  id: string,
  input: UpdateReminderRequest,
  viewer: Viewer,
): Promise<Reminder> {
  const before = await repository.findById(tx, id);
  if (!before) throw notFound('Lembrete não encontrado.');

  const { done, ...fields } = input;

  // Marcar como feito é o que a equipe faz no dia a dia, e qualquer um pode.
  // Mudar o que o lembrete diz é do autor ou da gerência.
  if (Object.keys(fields).length > 0) assertCanEdit(before, viewer);
  if (fields.assigneeUserId) await assertAssignable(tx, fields.assigneeUserId);

  const patch: Partial<repository.ReminderInsert> = {};
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.date !== undefined) patch.date = fields.date;
  if (fields.time !== undefined) patch.time = fields.time;
  if (fields.notes !== undefined) patch.notes = fields.notes;
  if (fields.assigneeUserId !== undefined) patch.assigneeUserId = fields.assigneeUserId;
  // Concluir de novo não reescreve QUANDO foi concluído.
  if (done !== undefined) patch.doneAt = done ? (before.doneAt ?? new Date()) : null;

  if (!(await repository.update(tx, id, patch))) throw notFound('Lembrete não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'reminder.updated',
    entityType: 'calendar_reminder',
    entityId: id,
    before: { title: before.title, date: before.date, done: before.doneAt !== null },
    after: { ...fields, ...(done !== undefined ? { done } : {}) },
  });

  return getReminder(tx, id);
}

export async function removeReminder(
  tx: Transaction,
  tenantId: string,
  id: string,
  viewer: Viewer,
): Promise<void> {
  const before = await repository.findById(tx, id);
  if (!before) throw notFound('Lembrete não encontrado.');
  assertCanEdit(before, viewer);

  await repository.remove(tx, id);

  await recordAudit(tx, {
    tenantId,
    action: 'reminder.removed',
    entityType: 'calendar_reminder',
    entityId: id,
    before: { title: before.title, date: before.date },
  });
}
