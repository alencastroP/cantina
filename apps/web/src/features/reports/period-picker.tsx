'use client';

import { useState } from 'react';

import { Input } from '../../components/ui/field';
import { cn } from '../../lib/cn';
import { addDays, monthRange, shiftMonth, todayInStore, type Range } from './api';

/**
 * Seletor de período.
 *
 * Os atalhos cobrem o que o lojista de fato pergunta — "como foi este mês?",
 * "e o mês passado?" — e o intervalo livre existe para o resto. Sem eles,
 * toda consulta começaria digitando duas datas, e a comparação com o mês
 * anterior, que é a única que dá significado ao número, quase nunca
 * aconteceria.
 *
 * `direction` separa dois usos que parecem o mesmo e não são:
 *
 *   `past`   relatório. O período termina hoje, no máximo. Incluir dias que
 *            ainda não aconteceram dilui a média do mês e faz o faturamento
 *            parecer em queda todo dia 1º.
 *   `ahead`  financeiro. O mês inteiro, incluindo o que ainda vai vencer —
 *            porque a pergunta ali é "dá para pagar o que vence sexta?", e
 *            ela não se responde olhando só para trás.
 */

export type PeriodDirection = 'past' | 'ahead';
export type PresetId = 'month' | 'last-month' | 'week' | 'quarter' | 'next' | 'custom';

export interface Period extends Range {
  preset: PresetId;
  label: string;
}

export function defaultPeriod(
  direction: PeriodDirection = 'past',
  today = todayInStore(),
): Period {
  return buildPreset('month', direction, today);
}

function buildPreset(
  preset: Exclude<PresetId, 'custom'>,
  direction: PeriodDirection,
  today: string,
): Period {
  switch (preset) {
    case 'month': {
      const month = monthRange(today);
      return {
        preset,
        from: month.from,
        to: direction === 'ahead' ? month.to : today,
        label: 'Este mês',
      };
    }
    case 'last-month': {
      const previous = monthRange(`${shiftMonth(today.slice(0, 7), -1)}-01`);
      return { preset, ...previous, label: 'Mês passado' };
    }
    case 'week': {
      return { preset, from: addDays(today, -6), to: today, label: 'Últimos 7 dias' };
    }
    case 'quarter': {
      return { preset, from: addDays(today, -89), to: today, label: 'Últimos 90 dias' };
    }
    case 'next': {
      return { preset, from: today, to: addDays(today, 30), label: 'Próximos 30 dias' };
    }
  }
}

const PRESETS: Record<PeriodDirection, Array<{ id: Exclude<PresetId, 'custom'>; label: string }>> =
  {
    past: [
      { id: 'month', label: 'Este mês' },
      { id: 'last-month', label: 'Mês passado' },
      { id: 'week', label: '7 dias' },
      { id: 'quarter', label: '90 dias' },
    ],
    // Sem "últimos 90 dias" aqui: num painel que olha para a frente, um
    // atalho que anda para trás só confunde o que o número significa.
    ahead: [
      { id: 'month', label: 'Este mês' },
      { id: 'next', label: 'Próximos 30 dias' },
      { id: 'last-month', label: 'Mês passado' },
    ],
  };

export function PeriodPicker({
  value,
  onChange,
  direction = 'past',
  className,
}: {
  value: Period;
  onChange: (period: Period) => void;
  direction?: PeriodDirection;
  className?: string;
}) {
  const today = todayInStore();
  const [custom, setCustom] = useState(value.preset === 'custom');

  const setRange = (patch: Partial<Range>) => {
    const next = { from: value.from, to: value.to, ...patch };
    // Arrastar o início para depois do fim é erro de digitação, não intenção:
    // a outra ponta acompanha, em vez de a tela devolver um período inválido.
    if (next.from > next.to) {
      if (patch.from) next.to = next.from;
      else next.from = next.to;
    }
    onChange({ ...next, preset: 'custom', label: 'Período escolhido' });
  };

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
      active
        ? 'border-clay-300 bg-clay-100 font-medium text-clay-700'
        : 'border-border bg-surface text-ink-soft hover:text-ink',
    );

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap gap-2">
        {PRESETS[direction].map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(buildPreset(preset.id, direction, today));
            }}
            className={chip(value.preset === preset.id)}
          >
            {preset.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setCustom((open) => !open)}
          aria-expanded={custom}
          className={chip(value.preset === 'custom')}
        >
          Escolher datas
        </button>
      </div>

      {custom ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={value.from}
            {...(direction === 'past' ? { max: today } : {})}
            onChange={(event) => setRange({ from: event.target.value })}
            aria-label="Data inicial"
            className="w-auto"
          />
          <span className="text-sm text-ink-muted">até</span>
          <Input
            type="date"
            value={value.to}
            {...(direction === 'past' ? { max: today } : {})}
            onChange={(event) => setRange({ to: event.target.value })}
            aria-label="Data final"
            className="w-auto"
          />
        </div>
      ) : null}
    </div>
  );
}
