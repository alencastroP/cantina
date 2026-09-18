'use client';

import type {
  CalendarEvent,
  CalendarEventKind,
  CreateReminderRequest,
  Reminder,
  UpdateReminderRequest,
} from '@cantina/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../lib/api';

/** Calendário da loja: lembretes e a visão unificada. */
export const calendarApi = {
  createReminder: (body: CreateReminderRequest) =>
    api.post<Reminder>('/calendar/reminders', body),

  updateReminder: (id: string, body: UpdateReminderRequest) =>
    api.patch<Reminder>(`/calendar/reminders/${id}`, body),

  removeReminder: (id: string) => api.delete<void>(`/calendar/reminders/${id}`),
};

export function feedPath({
  from,
  to,
  userId,
}: {
  from: string;
  to: string;
  userId?: string | undefined;
}): string {
  const params = new URLSearchParams({ from, to });
  if (userId) params.set('userId', userId);
  return `/calendar?${params.toString()}`;
}

/**
 * Cor de cada tipo.
 *
 * Oliva para encomenda (é o que a cozinha produz), terracota para lembrete
 * (é o que alguém precisa fazer) e azul-petróleo para conta. Três famílias da
 * paleta, e nenhuma saturada — o assunto do dia é o que está escrito, não a
 * cor da etiqueta.
 */
export const KIND_META: Record<
  CalendarEventKind,
  { label: string; plural: string; dot: string; pill: string; soft: string }
> = {
  preorder: {
    label: 'Encomenda',
    plural: 'Encomendas',
    dot: 'bg-olive-500',
    pill: 'bg-olive-100 text-olive-800',
    soft: 'bg-olive-50 text-olive-700',
  },
  reminder: {
    label: 'Lembrete',
    plural: 'Lembretes',
    dot: 'bg-clay-400',
    pill: 'bg-clay-100 text-clay-800',
    soft: 'bg-clay-50 text-clay-700',
  },
  finance: {
    label: 'Conta',
    plural: 'Contas',
    dot: 'bg-info-500',
    pill: 'bg-info-50 text-info-700',
    soft: 'bg-info-50 text-info-700',
  },
};

export const WEEKDAYS = [
  { short: 'Dom', letter: 'D' },
  { short: 'Seg', letter: 'S' },
  { short: 'Ter', letter: 'T' },
  { short: 'Qua', letter: 'Q' },
  { short: 'Qui', letter: 'Q' },
  { short: 'Sex', letter: 'S' },
  { short: 'Sáb', letter: 'S' },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Grade do mês em semanas inteiras, de domingo a sábado.
 *
 * Os dias do mês vizinho aparecem esmaecidos em vez de buracos: a semana do
 * dia 30 continua no dia 1º, e uma encomenda para sexta que cai no mês
 * seguinte precisa estar à vista de quem planeja a semana.
 */
export function monthGrid(month: string): { from: string; to: string; days: string[] } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  const cursor = new Date(Date.UTC(year, monthNumber - 1, 1));
  cursor.setUTCDate(1 - cursor.getUTCDay());

  const last = new Date(Date.UTC(year, monthNumber, 0));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));

  const days: string[] = [];
  while (cursor <= end) {
    days.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { from: days[0]!, to: days[days.length - 1]!, days };
}

const longDay = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "sábado, 12 de setembro". A data já é um dia local — sem conversão de fuso. */
export function dayLabel(date: string): string {
  return longDay.format(new Date(`${date}T12:00:00Z`));
}

/** Para onde o evento leva no painel. Lembrete abre no próprio calendário. */
export function eventHref(event: CalendarEvent): string | null {
  if (event.kind === 'preorder') return `/painel/encomendas/${event.id}`;
  if (event.kind === 'finance') return '/painel/financeiro';
  return null;
}

/* -------------------------------------------------------------------------- */
/* Preferências de visualização                                                */
/* -------------------------------------------------------------------------- */

export interface CalendarPreferences {
  view: 'month' | 'list';
  hidden: CalendarEventKind[];
  userId: string;
}

const DEFAULT_PREFERENCES: CalendarPreferences = { view: 'month', hidden: [], userId: '' };

function parsePreferences(raw: string | null): CalendarPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const value = JSON.parse(raw) as Partial<CalendarPreferences>;
    return {
      view: value.view === 'list' ? 'list' : 'month',
      hidden: Array.isArray(value.hidden)
        ? value.hidden.filter((kind): kind is CalendarEventKind => kind in KIND_META)
        : [],
      userId: typeof value.userId === 'string' ? value.userId : '',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Filtros e modo de visualização, lembrados por empresa.
 *
 * A chave leva o id da empresa: no computador do balcão, duas lojas abertas
 * em sequência não herdam os filtros uma da outra. É preferência de tela,
 * não dado — `localStorage` serve, e bloqueado (aba anônima) só volta ao
 * padrão a cada visita.
 */
export function useCalendarPreferences(tenantId: string | undefined) {
  const key = tenantId ? `cantina.calendario.${tenantId}` : null;
  const [preferences, setPreferences] = useState<CalendarPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    if (!key) return;
    try {
      setPreferences(parsePreferences(window.localStorage.getItem(key)));
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, [key]);

  const update = useCallback(
    (patch: Partial<CalendarPreferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        try {
          if (key) window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage bloqueado: a preferência vale até o reload.
        }
        return next;
      });
    },
    [key],
  );

  return [preferences, update] as const;
}
