'use client';

import { MinusIcon, PlusIcon, TrashIcon } from '../../components/layout/icons';
import { cn } from '../../lib/cn';

/**
 * Quantidade em dois toques: − e +.
 *
 * Com `min={0}` (o padrão, na lista e na sacola) o − do último item vira
 * lixeira: o ícone avisa que aquele toque tira o produto, em vez de
 * surpreender. O `max` vem do estoque disponível — o servidor recusaria de
 * qualquer jeito, mas descobrir isso no fim do checkout é pior do que ver o +
 * apagar agora.
 */
export function Stepper({
  qty,
  onChange,
  label,
  min = 0,
  max,
  size = 'md',
  className,
}: {
  qty: number;
  onChange: (qty: number) => void;
  /** Nome do produto — vai para o `aria-label` dos dois botões. */
  label: string;
  min?: number;
  max?: number | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const atMax = max !== null && max !== undefined && qty >= max;
  const removes = min === 0 && qty <= 1;
  const box = size === 'sm' ? 'size-8' : 'size-9';

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full bg-mode-tint p-0.5 text-mode-ink',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= min}
        aria-label={removes ? `Remover ${label}` : `Diminuir ${label}`}
        className={cn(
          box,
          'grid place-items-center rounded-full transition-[background-color,transform] duration-150 hover:bg-mode/10 active:scale-85 disabled:opacity-35',
        )}
      >
        {removes ? <TrashIcon size={16} /> : <MinusIcon size={16} />}
      </button>

      <span
        key={qty}
        className="min-w-7 animate-bump text-center text-sm font-semibold"
        data-numeric
      >
        {qty}
      </span>

      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={atMax}
        aria-label={`Aumentar ${label}`}
        className={cn(
          box,
          'grid place-items-center rounded-full bg-mode text-ink-inverse shadow-soft transition-[background-color,transform] duration-150 hover:bg-mode-strong active:scale-85 disabled:opacity-35',
        )}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}
