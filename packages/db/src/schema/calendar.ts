import { date, index, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';

import { primaryId, timestamps } from './_columns';
import { tenantId } from './_tenant';
import { users } from './identity';

/**
 * Lembretes do calendário.
 *
 * O calendário é UM por empresa: toda a equipe enxerga a mesma agenda, e o
 * RLS por `tenant_id` é o que impede que ela se misture com a de outra loja.
 * Encomendas e vencimentos aparecem nele sem tabela própria — são lidos dos
 * módulos donos. Esta tabela guarda só o que ninguém mais guarda: o "ligar
 * para o fornecedor na terça", o "buscar a forma nova".
 *
 * Remoção é física: um lembrete não tem histórico financeiro nem estoque
 * pendurado, e a auditoria registra quem apagou.
 */
export const calendarReminders = pgTable(
  'calendar_reminders',
  {
    id: primaryId(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    notes: text('notes'),
    /** Dia de calendário, não instante (P5). */
    date: date('date').notNull(),
    /** Opcional: sem hora, o lembrete vale para o dia inteiro. */
    time: time('time'),
    /** Quem cuida. Nulo = a equipe toda. */
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    // O calendário sempre lê por intervalo de datas.
    index('calendar_reminders_date_idx').on(table.tenantId, table.date),
    index('calendar_reminders_assignee_idx').on(table.tenantId, table.assigneeUserId),
  ],
);
