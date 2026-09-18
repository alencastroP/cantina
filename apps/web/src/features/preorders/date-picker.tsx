'use client';

import { cn } from '../../lib/cn';

/**
 * Escolha da data de entrega.
 *
 * Chips de dias, não um `<input type="date">`: o calendário do sistema não
 * sabe quais dias a loja aceita, e deixar a pessoa escolher para ser recusada
 * depois é o pior dos dois mundos. Aqui só o que está disponível é clicável, e
 * o que não está diz por quê.
 */

export interface PickerDay {
  date: string;
  available: boolean;
  slotsLeft: number;
  reason: 'closed' | 'full' | 'lead_time' | 'horizon' | null;
}

const REASON_LABELS: Record<string, string> = {
  closed: 'fechado',
  full: 'lotado',
  lead_time: 'cedo demais',
  horizon: 'longe demais',
};

function label(date: string): { weekday: string; day: string; month: string } {
  const parsed = new Date(`${date}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
      .format(parsed)
      .replace('.', ''),
    day: String(parsed.getUTCDate()),
    month: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
      .format(parsed)
      .replace('.', ''),
  };
}

export function DatePicker({
  days,
  value,
  onChange,
  showUnavailable = true,
}: {
  days: PickerDay[];
  value: string | null;
  onChange: (date: string) => void;
  /** Na vitrine, esconder o indisponível deixa a escolha mais curta. */
  showUnavailable?: boolean;
}) {
  const visible = showUnavailable ? days : days.filter((day) => day.available);

  if (visible.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-ink-muted">
        Nenhuma data disponível no período. Tente mais adiante.
      </p>
    );
  }

  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox">
      {visible.map((day) => {
        const parts = label(day.date);
        const selected = value === day.date;

        return (
          <li key={day.date}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!day.available}
              onClick={() => onChange(day.date)}
              title={day.available ? undefined : REASON_LABELS[day.reason ?? 'closed']}
              className={cn(
                'flex w-20 shrink-0 flex-col items-center gap-0.5 rounded-card border px-2 py-2.5 transition-colors',
                selected
                  ? 'border-primary bg-clay-50 text-clay-700'
                  : day.available
                    ? 'border-border bg-surface text-ink-soft hover:border-border-strong'
                    : 'cursor-not-allowed border-border bg-sand-100 text-ink-muted/60',
              )}
            >
              <span className="text-xs capitalize">{parts.weekday}</span>
              <span className="text-lg font-medium leading-none" data-numeric>
                {parts.day}
              </span>
              <span className="text-xs capitalize">{parts.month}</span>

              {day.available ? (
                day.slotsLeft <= 3 ? (
                  // Escassez só quando é verdade: "restam 2" com dez vagas
                  // seria pressão inventada.
                  <span className="mt-0.5 text-[0.625rem] text-warning-700">
                    {day.slotsLeft === 1 ? 'última' : `restam ${day.slotsLeft}`}
                  </span>
                ) : null
              ) : (
                <span className="mt-0.5 text-[0.625rem]">
                  {REASON_LABELS[day.reason ?? 'closed']}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Intervalo `[hoje, hoje + dias]` em `AAAA-MM-DD`, no fuso da loja. */
export function dateRange(days: number, timeZone = 'America/Sao_Paulo'): {
  from: string;
  to: string;
} {
  const format = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

  return {
    from: format(new Date()),
    to: format(new Date(Date.now() + days * 86_400_000)),
  };
}
