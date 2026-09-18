'use client';

import type {
  CalendarEvent,
  CalendarEventKind,
  CalendarFeed,
  CalendarFeedDay,
  Page as ApiPage,
  Reminder,
  User,
} from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import { useSession } from '../../../../components/auth-provider';
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PlusIcon,
} from '../../../../components/layout/icons';
import { PageHeader } from '../../../../components/layout/page-header';
import { Button } from '../../../../components/ui/button';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { Select } from '../../../../components/ui/field';
import {
  calendarApi,
  dayLabel,
  eventHref,
  feedPath,
  KIND_META,
  monthGrid,
  useCalendarPreferences,
  WEEKDAYS,
} from '../../../../features/calendar/api';
import {
  ReminderDialog,
  type ReminderDialogState,
} from '../../../../features/calendar/reminder-dialog';
import { currentMonth, monthLabel, shiftMonth } from '../../../../features/preorders/api';
import { todayInStore } from '../../../../features/reports/api';
import { cn } from '../../../../lib/cn';
import { formatCents } from '../../../../lib/format';
import { useApi, useMutation } from '../../../../lib/use-api';

/**
 * Calendário da loja.
 *
 * Um só por empresa: encomendas, lembretes da equipe e vencimentos na mesma
 * grade, e toda a equipe vê a mesma coisa. O que muda por pessoa é o filtro —
 * e ele é lembrado por empresa, não por navegador.
 *
 * A navegação do mês fica numa barra própria, fora do cabeçalho da página:
 * mês, filtros e modo de visualização são a ferramenta desta tela, não o
 * título dela. No celular a grade vira pontos e o dia escolhido abre a lista
 * logo abaixo; no desktop a lista do dia fica ao lado.
 */
export default function CalendarioPage() {
  const { user, tenant } = useSession();
  const [preferences, setPreferences] = useCalendarPreferences(tenant?.id);

  const today = todayInStore();
  const [month, setMonth] = useState(currentMonth);
  const [selected, setSelected] = useState(today);
  const [dialog, setDialog] = useState<ReminderDialogState | null>(null);
  const toggle = useMutation();

  const grid = useMemo(() => monthGrid(month), [month]);
  const feed = useApi<CalendarFeed>(
    feedPath({ from: grid.from, to: grid.to, userId: preferences.userId || undefined }),
  );
  const team = useApi<ApiPage<User>>('/users?limit=100&status=active');

  const hidden = new Set(preferences.hidden);
  const availableKinds: CalendarEventKind[] = feed.data?.kinds ?? ['preorder', 'reminder'];
  const events = (feed.data?.events ?? []).filter((event) => !hidden.has(event.kind));

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date);
      if (list) list.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [events]);

  const daysByDate = useMemo(
    () => new Map((feed.data?.days ?? []).map((day) => [day.date, day])),
    [feed.data],
  );

  // Contagem do MÊS, não da grade: os dias vizinhos são contexto, não conta.
  const countByKind = new Map<CalendarEventKind, number>();
  for (const event of feed.data?.events ?? []) {
    if (!event.date.startsWith(month)) continue;
    countByKind.set(event.kind, (countByKind.get(event.kind) ?? 0) + 1);
  }

  function goToMonth(next: string) {
    setMonth(next);
    setSelected(today.startsWith(next) ? today : `${next}-01`);
  }

  function selectDay(date: string) {
    setSelected(date);
    // Tocar num dia do mês vizinho leva até ele, como num calendário de papel.
    if (!date.startsWith(month)) setMonth(date.slice(0, 7));
  }

  function toggleKind(kind: CalendarEventKind) {
    setPreferences({
      hidden: hidden.has(kind)
        ? preferences.hidden.filter((item) => item !== kind)
        : [...preferences.hidden, kind],
    });
  }

  function canEdit(reminder: Reminder): boolean {
    return (
      reminder.createdByUserId === user?.id || user?.role === 'owner' || user?.role === 'manager'
    );
  }

  async function toggleDone(reminder: Reminder) {
    const result = await toggle.run(() =>
      calendarApi.updateReminder(reminder.id, { done: reminder.doneAt === null }),
    );
    if (result) feed.reload();
  }

  const members = team.data?.items ?? [];
  const isCurrentMonth = month === currentMonth();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Calendário"
        description="Encomendas, lembretes e vencimentos — a mesma agenda para toda a equipe."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<PlusIcon size={16} />}
            onClick={() => setDialog({ mode: 'create', date: selected })}
          >
            Novo lembrete
          </Button>
        }
      />

      {/* --- Barra do calendário: fora do cabeçalho da página --- */}
      <section
        aria-label="Navegação e filtros do calendário"
        className="mb-5 flex flex-col gap-3 rounded-[1.25rem] border border-border bg-surface/80 p-3 shadow-soft sm:p-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex items-center gap-1.5">
          <RoundButton label="Mês anterior" onClick={() => goToMonth(shiftMonth(month, -1))}>
            <ChevronLeftIcon size={18} />
          </RoundButton>
          <h2
            className="min-w-0 flex-1 text-center font-display text-xl capitalize text-ink sm:min-w-48 sm:flex-none"
            aria-live="polite"
          >
            {monthLabel(month)}
          </h2>
          <RoundButton label="Próximo mês" onClick={() => goToMonth(shiftMonth(month, 1))}>
            <ChevronRightIcon size={18} />
          </RoundButton>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1"
            disabled={isCurrentMonth && selected === today}
            onClick={() => {
              setMonth(currentMonth());
              setSelected(today);
            }}
          >
            Hoje
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="O que mostrar" className="flex flex-wrap gap-1.5">
            {availableKinds.map((kind) => {
              const active = !hidden.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleKind(kind)}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors',
                    active
                      ? 'border-border-strong bg-sand-50 text-ink'
                      : 'border-dashed border-border bg-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      active ? KIND_META[kind].dot : 'bg-sand-300',
                    )}
                  />
                  {KIND_META[kind].plural}
                  <span className="text-xs text-ink-muted" data-numeric>
                    {countByKind.get(kind) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <Select
            controlSize="sm"
            className="w-auto min-w-44"
            aria-label="Filtrar lembretes por pessoa"
            value={preferences.userId}
            onChange={(event) => setPreferences({ userId: event.target.value })}
          >
            <option value="">Lembretes de todos</option>
            {user ? <option value={user.id}>Meus lembretes</option> : null}
            {members
              .filter((member) => member.id !== user?.id)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  De {member.name}
                </option>
              ))}
          </Select>

          <div
            role="group"
            aria-label="Modo de visualização"
            className="inline-flex rounded-full bg-sand-200 p-0.5"
          >
            {(
              [
                ['month', 'Mês', CalendarIcon],
                ['list', 'Lista', ListIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={preferences.view === value}
                onClick={() => setPreferences({ view: value })}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors',
                  preferences.view === value
                    ? 'bg-surface font-medium text-ink shadow-soft'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {feed.error ? (
        <Alert tone="danger" title="Não foi possível carregar o calendário." className="mb-5">
          {feed.error.message}
        </Alert>
      ) : null}
      {toggle.error ? (
        <Alert tone="danger" className="mb-5">
          {toggle.error}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {feed.loading && !feed.data ? (
          <Skeleton className="h-[28rem] rounded-[1.25rem]" />
        ) : preferences.view === 'month' ? (
          <MonthGrid
            month={month}
            days={grid.days}
            today={today}
            selected={selected}
            eventsByDate={eventsByDate}
            daysByDate={daysByDate}
            onSelect={selectDay}
          />
        ) : (
          <MonthList
            month={month}
            events={events}
            today={today}
            onSelect={selectDay}
            onEditReminder={(reminder) => setDialog({ mode: 'edit', reminder })}
            onToggleReminder={(reminder) => void toggleDone(reminder)}
          />
        )}

        <DayPanel
          date={selected}
          today={today}
          day={daysByDate.get(selected)}
          events={eventsByDate.get(selected) ?? []}
          showsPreorders={!hidden.has('preorder')}
          onAdd={() => setDialog({ mode: 'create', date: selected })}
          onEditReminder={(reminder) => setDialog({ mode: 'edit', reminder })}
          onToggleReminder={(reminder) => void toggleDone(reminder)}
        />
      </div>

      <ReminderDialog
        state={dialog}
        team={members}
        currentUserId={user?.id}
        canEdit={canEdit}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          feed.reload();
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-sand-200 hover:text-ink"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Grade do mês                                                                */
/* -------------------------------------------------------------------------- */

function MonthGrid({
  month,
  days,
  today,
  selected,
  eventsByDate,
  daysByDate,
  onSelect,
}: {
  month: string;
  days: string[];
  today: string;
  selected: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  daysByDate: Map<string, CalendarFeedDay>;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-border bg-surface p-2 shadow-soft sm:p-3">
      <div className="grid grid-cols-7 pb-2" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday.short}
            className="text-center text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
          >
            <span className="sm:hidden">{weekday.letter}</span>
            <span className="hidden sm:inline">{weekday.short}</span>
          </div>
        ))}
      </div>

      <ol className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((date) => (
          <li key={date}>
            <DayTile
              date={date}
              inMonth={date.startsWith(month)}
              isToday={date === today}
              isSelected={date === selected}
              events={eventsByDate.get(date) ?? []}
              day={daysByDate.get(date)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function DayTile({
  date,
  inMonth,
  isToday,
  isSelected,
  events,
  day,
  onSelect,
}: {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
  day: CalendarFeedDay | undefined;
  onSelect: (date: string) => void;
}) {
  const capacity = day?.isOpen ? day.capacity : 0;
  const taken = day?.taken ?? 0;
  const ratio = capacity > 0 ? Math.min(1, taken / capacity) : 0;
  const kinds = [...new Set(events.map((event) => event.kind))];
  const pending = events.filter((event) => !event.done);

  const summary = [
    events.length === 0 ? 'nada marcado' : `${events.length} item(ns)`,
    capacity > 0 ? `${taken} de ${capacity} vagas de encomenda` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${dayLabel(date)}: ${summary}`}
      className={cn(
        'flex h-full min-h-14 w-full flex-col rounded-xl p-1 text-left transition-colors sm:min-h-[6.75rem] sm:p-1.5',
        inMonth ? 'bg-sand-50 hover:bg-sand-100' : 'bg-transparent hover:bg-sand-100/60',
        day && !day.isOpen && inMonth && 'bg-sand-100/70',
        isSelected && 'bg-clay-50 ring-2 ring-clay-300 hover:bg-clay-50',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          data-numeric
          className={cn(
            'grid size-7 place-items-center rounded-full text-sm',
            isToday
              ? 'bg-primary font-medium text-ink-inverse'
              : inMonth
                ? 'text-ink'
                : 'text-ink-muted/60',
          )}
        >
          {Number(date.slice(-2))}
        </span>
        {capacity > 0 ? (
          <span className="hidden text-[0.6875rem] text-ink-muted sm:inline" data-numeric>
            {taken}/{capacity}
          </span>
        ) : null}
      </div>

      {/* Ocupação: uma barra fina, não um número. A pergunta do lojista é
          "ainda cabe?", e a barra responde na mesma olhada. */}
      {capacity > 0 ? (
        <div className="mx-0.5 mt-1 h-1 overflow-hidden rounded-full bg-sand-200">
          <div
            className={cn(
              'h-full rounded-full',
              ratio >= 1 ? 'bg-danger-500' : ratio >= 0.75 ? 'bg-warning-500' : 'bg-olive-400',
            )}
            style={{ width: `${Math.max(ratio * 100, taken > 0 ? 8 : 0)}%` }}
          />
        </div>
      ) : null}

      {/* Desktop: as três primeiras, pelo título. */}
      <ul className={cn('mt-1.5 hidden space-y-1 sm:block', !inMonth && 'opacity-60')}>
        {events.slice(0, 3).map((event) => (
          <li
            key={event.key}
            className={cn(
              'truncate rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-4',
              KIND_META[event.kind].pill,
              event.done && 'line-through opacity-60',
            )}
          >
            {event.time ? <span data-numeric>{event.time} </span> : null}
            {event.title}
          </li>
        ))}
        {events.length > 3 ? (
          <li className="px-1.5 text-[0.6875rem] text-ink-muted">+{events.length - 3} mais</li>
        ) : null}
      </ul>

      {/* Celular: um ponto por tipo — o detalhe abre embaixo da grade. */}
      <div className="mt-auto flex justify-center gap-0.5 pt-1 sm:hidden" aria-hidden="true">
        {kinds.map((kind) => (
          <span
            key={kind}
            className={cn(
              'size-1.5 rounded-full',
              KIND_META[kind].dot,
              pending.every((event) => event.kind !== kind) && 'opacity-40',
            )}
          />
        ))}
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Lista do mês                                                                */
/* -------------------------------------------------------------------------- */

function MonthList({
  month,
  events,
  today,
  onSelect,
  onEditReminder,
  onToggleReminder,
}: {
  month: string;
  events: CalendarEvent[];
  today: string;
  onSelect: (date: string) => void;
  onEditReminder: (reminder: Reminder) => void;
  onToggleReminder: (reminder: Reminder) => void;
}) {
  const inMonth = events.filter((event) => event.date.startsWith(month));

  if (inMonth.length === 0) {
    return (
      <EmptyState
        title="Nada marcado neste mês"
        description="Encomendas, lembretes e contas aparecem aqui assim que tiverem data."
      />
    );
  }

  const groups: Array<[string, CalendarEvent[]]> = [];
  for (const event of inMonth) {
    const last = groups[groups.length - 1];
    if (last && last[0] === event.date) last[1].push(event);
    else groups.push([event.date, [event]]);
  }

  return (
    <div className="space-y-4">
      {groups.map(([date, items]) => (
        <section
          key={date}
          className="rounded-[1.25rem] border border-border bg-surface p-3 shadow-soft sm:p-4"
        >
          <button
            type="button"
            onClick={() => onSelect(date)}
            className="mb-2 flex items-baseline gap-2 text-left"
          >
            <span className="font-display text-lg capitalize text-ink">{dayLabel(date)}</span>
            {date === today ? (
              <span className="rounded-full bg-clay-100 px-2 py-0.5 text-xs font-medium text-clay-700">
                hoje
              </span>
            ) : null}
          </button>
          <ul className="space-y-1.5">
            {items.map((event) => (
              <li key={event.key}>
                <EventItem
                  event={event}
                  onEditReminder={onEditReminder}
                  onToggleReminder={onToggleReminder}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* O dia escolhido                                                             */
/* -------------------------------------------------------------------------- */

function DayPanel({
  date,
  today,
  day,
  events,
  showsPreorders,
  onAdd,
  onEditReminder,
  onToggleReminder,
}: {
  date: string;
  today: string;
  day: CalendarFeedDay | undefined;
  events: CalendarEvent[];
  showsPreorders: boolean;
  onAdd: () => void;
  onEditReminder: (reminder: Reminder) => void;
  onToggleReminder: (reminder: Reminder) => void;
}) {
  const occupancy =
    !showsPreorders || !day
      ? null
      : day.isOpen && day.capacity > 0
        ? `${day.taken} de ${day.capacity} vagas de encomenda ocupadas`
        : `Não aceita encomendas${day.exceptionReason ? ` — ${day.exceptionReason}` : ''}`;

  return (
    <aside aria-label="Dia escolhido" className="lg:sticky lg:top-6 lg:self-start">
      <div className="overflow-hidden rounded-[1.25rem] border border-border bg-surface shadow-soft">
        <header className="flex items-start justify-between gap-3 border-b border-border bg-sand-100/60 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
              {date === today ? 'Hoje' : 'Dia escolhido'}
            </p>
            <h2 className="font-display text-lg capitalize text-ink">{dayLabel(date)}</h2>
            {occupancy ? <p className="mt-0.5 text-sm text-ink-muted">{occupancy}</p> : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<PlusIcon size={15} />}
            onClick={onAdd}
            aria-label="Novo lembrete neste dia"
          >
            Lembrete
          </Button>
        </header>

        <div className="p-3">
          {events.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-ink-muted">
              Nada marcado para este dia.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((event) => (
                <li key={event.key}>
                  <EventItem
                    event={event}
                    onEditReminder={onEditReminder}
                    onToggleReminder={onToggleReminder}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

function EventItem({
  event,
  onEditReminder,
  onToggleReminder,
}: {
  event: CalendarEvent;
  onEditReminder: (reminder: Reminder) => void;
  onToggleReminder: (reminder: Reminder) => void;
}) {
  const meta = KIND_META[event.kind];
  const reminder = event.reminder;

  const body = (
    <div className="min-w-0 flex-1">
      <p className={cn('truncate text-sm font-medium text-ink', event.done && 'text-ink-muted line-through')}>
        {event.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-muted">
        {[
          event.time,
          event.kind === 'reminder' ? (event.userName ? `Para ${event.userName}` : 'Equipe toda') : null,
          event.kind === 'preorder' ? event.detail : null,
          event.statusLabel,
          event.amountCents !== null
            ? `${event.direction === 'out' ? '−' : ''}${formatCents(event.amountCents)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {event.kind === 'reminder' && event.detail ? (
        <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{event.detail}</p>
      ) : null}
    </div>
  );

  if (reminder) {
    return (
      <div className="group flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sand-100">
        <button
          type="button"
          role="checkbox"
          aria-checked={event.done}
          aria-label={`Marcar “${event.title}” como ${event.done ? 'não feito' : 'feito'}`}
          onClick={() => onToggleReminder(reminder)}
          className={cn(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
            event.done
              ? 'border-clay-400 bg-clay-400 text-ink-inverse'
              : 'border-border-strong bg-surface hover:border-clay-400',
          )}
        >
          {event.done ? <CheckIcon size={13} strokeWidth={2.5} /> : null}
        </button>
        <button
          type="button"
          onClick={() => onEditReminder(reminder)}
          className="min-w-0 flex-1 rounded-control text-left"
        >
          {body}
        </button>
      </div>
    );
  }

  const href = eventHref(event);
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', meta.soft)}
      >
        <span className={cn('size-2 rounded-full', meta.dot)} />
      </span>
      {body}
      <span className="sr-only">({meta.label})</span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sand-100"
    >
      {content}
    </Link>
  ) : (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2">{content}</div>
  );
}
