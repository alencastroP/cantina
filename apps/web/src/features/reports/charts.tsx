import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * As três formas de mostrar número que o painel usa.
 *
 * Nenhuma biblioteca de gráfico: `StatCard` é texto, `BarList` é uma div com
 * largura percentual e `Sparkline` é um `<path>` de dez linhas. Recharts
 * pesaria mais de 400 kB para desenhar barras horizontais, num painel que o
 * lojista abre no celular do balcão.
 */

/* -------------------------------------------------------------------------- */
/* Indicador                                                                   */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  loading?: boolean;
}) {
  const valueTone = {
    neutral: 'text-ink',
    positive: 'text-success-700',
    negative: 'text-danger-700',
    accent: 'text-clay-700',
  }[tone];

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3.5 shadow-soft">
      <p className="text-sm text-ink-muted">{label}</p>
      {loading ? (
        <div className="mt-1.5 h-7 w-24 animate-pulse rounded-control bg-sand-200" />
      ) : (
        <p className={cn('mt-0.5 font-display text-2xl tabular-nums', valueTone)}>{value}</p>
      )}
      {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lista com barra                                                             */
/* -------------------------------------------------------------------------- */

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Texto à direita: o número formatado como o leitor deve lê-lo. */
  display: string;
  /** Segunda linha, menor: margem, quantidade, participação. */
  detail?: string;
  href?: string;
}

/**
 * Ranking com barra proporcional ao maior valor — não ao total.
 *
 * Proporcional ao total, uma lista de vinte produtos vira vinte tracinhos
 * indistinguíveis. Ao maior, a comparação que importa (quem vende mais que
 * quem) fica legível já na primeira olhada.
 */
export function BarList({ rows, emptyLabel }: { rows: BarRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.key} className="relative overflow-hidden rounded-control">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-clay-100"
            style={{ width: `${(Math.abs(row.value) / max) * 100}%` }}
          />
          <div className="relative flex items-baseline justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{row.label}</p>
              {row.detail ? (
                <p className="truncate text-xs text-ink-muted">{row.detail}</p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm tabular-nums text-ink-soft">{row.display}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Série temporal                                                              */
/* -------------------------------------------------------------------------- */

export interface SeriesPoint {
  label: string;
  value: number;
  /** Ponto no futuro: desenhado tracejado, porque é projeção e não fato. */
  projected?: boolean;
}

/**
 * Linha de série temporal.
 *
 * A escala inclui o zero de propósito. Um gráfico que começa no menor valor
 * transforma uma variação de 2% num despenhadeiro, e quem olha rápido — que é
 * como se olha um painel — decide errado.
 */
export function Sparkline({
  points,
  height = 120,
  format,
}: {
  points: SeriesPoint[];
  height?: number;
  format: (value: number) => string;
}) {
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Um dia só não desenha uma linha. Escolha um período maior.
      </p>
    );
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const width = 100;
  const x = (index: number) => (index / (points.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * height;

  const firstProjected = points.findIndex((point) => point.projected);
  const solidEnd = firstProjected === -1 ? points.length : firstProjected;

  const path = (from: number, to: number) =>
    points
      .slice(from, to)
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(from + index)} ${y(point.value)}`)
      .join(' ');

  const last = points.at(-1);
  const zeroY = y(0);

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={`Série de ${points.length} dias, de ${format(values[0] ?? 0)} a ${format(last?.value ?? 0)}.`}
      >
        {min < 0 ? (
          <line
            x1="0"
            x2={width}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--color-border-strong)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <path
          d={path(0, solidEnd)}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {solidEnd < points.length ? (
          <path
            // Começa no último ponto realizado para a linha não ter buraco.
            d={path(Math.max(0, solidEnd - 1), points.length)}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeOpacity="0.55"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      <figcaption className="flex justify-between text-xs text-ink-muted">
        <span>{points[0]?.label}</span>
        {solidEnd < points.length ? <span>— — projeção</span> : null}
        <span>{last?.label}</span>
      </figcaption>
    </figure>
  );
}
