'use client';

import type { PublicDay } from '@cantina/contracts';

import { cn } from '../../lib/cn';

/**
 * Dias para encomendar, num trilho que rola com o dedo.
 *
 * Só o que tem vaga aparece: na vitrine, dia esmaecido é só um jeito mais
 * lento de dizer não. (O painel usa o `DatePicker`, que mostra os
 * indisponíveis e o porquê — o lojista precisa saber que sábado lotou.)
 *
 * Escassez só quando é verdade: "2 vagas" com dez sobrando seria pressão
 * inventada. Por baixo são rádios nativos, com setas do teclado de graça.
 */

function parts(date: string): { weekday: string; day: string; month: string; long: string } {
  const parsed = new Date(`${date}T12:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(parsed).replace('.', '');

  return {
    weekday: format({ weekday: 'short' }),
    day: String(parsed.getUTCDate()),
    month: format({ month: 'short' }),
    long: format({ weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

export function DateStrip({
  days,
  value,
  onChange,
}: {
  days: PublicDay[];
  value: string | null;
  onChange: (date: string) => void;
}) {
  const available = days.filter((day) => day.available);

  if (available.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
        Nenhum dia com vaga nos próximos meses. Vale falar com a loja — às vezes dá um jeito.
      </p>
    );
  }

  return (
    // `min-w-0`: fieldset nasce com `min-inline-size: min-content` e se
    // esticaria até a largura de todos os dias somados, alargando a página.
    <fieldset className="min-w-0">
      <legend className="sr-only">Dia da retirada</legend>
      <div
        data-scroll-x
        className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-3 pt-2"
      >
        {available.map((day, index) => {
          const label = parts(day.date);
          const selected = value === day.date;
          const scarce = day.slotsLeft <= 3;

          return (
            <label
              key={day.date}
              style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
              className={cn(
                'relative flex w-[4.25rem] shrink-0 animate-rise cursor-pointer snap-start flex-col items-center rounded-2xl border px-1 pb-2.5 pt-2 transition-[translate,scale,background-color,border-color,box-shadow,color] duration-300 ease-[var(--ease-spring)]',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mode',
                selected
                  ? '-translate-y-1 border-mode bg-mode text-ink-inverse shadow-[0_14px_24px_-12px_var(--color-mode)]'
                  : 'border-border bg-surface text-ink-soft hover:border-border-strong active:scale-95',
              )}
            >
              <input
                type="radio"
                name="due-date"
                value={day.date}
                checked={selected}
                onChange={() => onChange(day.date)}
                aria-label={`${label.long}${scarce ? `, ${day.slotsLeft === 1 ? 'última vaga' : `${day.slotsLeft} vagas`}` : ''}`}
                className="sr-only"
              />
              <span aria-hidden="true" className="text-[0.68rem] font-semibold uppercase tracking-wider opacity-75">
                {label.weekday}
              </span>
              <span aria-hidden="true" className="font-display text-[1.7rem] leading-none" data-numeric>
                {label.day}
              </span>
              <span aria-hidden="true" className="text-[0.7rem] opacity-75">
                {label.month}
              </span>
              {scarce ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 rounded-full px-1.5 py-px text-[0.6rem] font-semibold',
                    selected ? 'bg-ink-inverse/20' : 'bg-warning-50 text-warning-700',
                  )}
                >
                  {day.slotsLeft === 1 ? 'última' : `${day.slotsLeft} vagas`}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
