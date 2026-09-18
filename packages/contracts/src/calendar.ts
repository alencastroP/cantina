import { z } from 'zod';

import { dateOnlySchema, positiveCentsSchema, uuidSchema } from './common';

/**
 * Calendário da loja.
 *
 * Um só por empresa: toda a equipe olha para a mesma agenda, e é o RLS que
 * garante que ela não se mistura com a de outra loja. O que aparece nele vem
 * de três lugares com donos diferentes:
 *
 *   encomendas   data de entrega (módulo 7), com a ocupação da agenda
 *   lembretes    escritos à mão pela equipe (este contrato)
 *   financeiro   vencimentos — só para quem enxerga o financeiro
 *
 * O servidor corta o que o papel não pode ver. Pedir `kinds=finance` como
 * atendente não devolve erro: devolve o calendário sem as contas, que é o
 * mesmo que ele veria sem pedir.
 */

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.');

/** Janela máxima: seis semanas de grade mais folga. Mais que isso não é tela. */
export const CALENDAR_MAX_RANGE_DAYS = 62;

export const calendarEventKindSchema = z.enum(['preorder', 'reminder', 'finance']);
export type CalendarEventKind = z.infer<typeof calendarEventKindSchema>;

/* -------------------------------------------------------------------------- */
/* Lembretes                                                                   */
/* -------------------------------------------------------------------------- */

export const reminderSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  notes: z.string().nullable(),
  date: dateOnlySchema,
  /** `HH:MM`, ou `null` para o dia inteiro. */
  time: z.string().nullable(),
  assigneeUserId: uuidSchema.nullable(),
  assigneeName: z.string().nullable(),
  createdByUserId: uuidSchema.nullable(),
  createdByName: z.string().nullable(),
  doneAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const createReminderRequestSchema = z.object({
  title: z.string().trim().min(2, 'Escreva ao menos 2 caracteres.').max(120),
  date: dateOnlySchema,
  time: timeSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /** Omitido ou nulo: o lembrete é da equipe toda. */
  assigneeUserId: uuidSchema.nullable().optional(),
});
export type CreateReminderRequest = z.infer<typeof createReminderRequestSchema>;

export const updateReminderRequestSchema = z
  .object({
    title: z.string().trim().min(2, 'Escreva ao menos 2 caracteres.').max(120).optional(),
    date: dateOnlySchema.optional(),
    time: timeSchema.nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    assigneeUserId: uuidSchema.nullable().optional(),
    /** Concluir é aberto a todos; editar o resto, só a quem escreveu ou gerencia. */
    done: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateReminderRequest = z.infer<typeof updateReminderRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Visão do calendário                                                         */
/* -------------------------------------------------------------------------- */

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export const calendarFeedQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    /** Lista separada por vírgula. Omitida, traz tudo o que o papel permite. */
    kinds: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').filter(Boolean) : undefined))
      .pipe(z.array(calendarEventKindSchema).optional()),
    /** Só os lembretes desta pessoa — atribuídos a ela ou escritos por ela. */
    userId: uuidSchema.optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'O fim do período vem antes do início.',
    path: ['to'],
  })
  .refine((value) => daysBetween(value.from, value.to) <= CALENDAR_MAX_RANGE_DAYS, {
    message: `O período pode ter no máximo ${CALENDAR_MAX_RANGE_DAYS} dias.`,
    path: ['to'],
  });
export type CalendarFeedQuery = z.infer<typeof calendarFeedQuerySchema>;

export const calendarEventSchema = z.object({
  /** `kind:id` — estável para servir de chave na lista. */
  key: z.string(),
  kind: calendarEventKindSchema,
  id: uuidSchema,
  date: dateOnlySchema,
  time: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  /** Encomenda: o status do fluxo. Conta: `open`, `paid` ou `overdue`. */
  status: z.string().nullable(),
  statusLabel: z.string().nullable(),
  done: z.boolean(),
  /** Total da encomenda ou valor da conta. Nunca custo. */
  amountCents: positiveCentsSchema.nullable(),
  direction: z.enum(['in', 'out']).nullable(),
  userId: uuidSchema.nullable(),
  userName: z.string().nullable(),
  /** Presente só em lembrete: é o que a tela precisa para editá-lo. */
  reminder: reminderSchema.nullable(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

/** Ocupação da agenda de encomendas no dia (D10). */
export const calendarFeedDaySchema = z.object({
  date: dateOnlySchema,
  isOpen: z.boolean(),
  capacity: z.number().int(),
  taken: z.number().int(),
  exceptionReason: z.string().nullable(),
});
export type CalendarFeedDay = z.infer<typeof calendarFeedDaySchema>;

export const calendarFeedSchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  /** O que ESTE usuário pode ver — a tela só oferece esses filtros. */
  kinds: z.array(calendarEventKindSchema),
  days: z.array(calendarFeedDaySchema),
  events: z.array(calendarEventSchema),
});
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;
