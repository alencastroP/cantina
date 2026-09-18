import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * Etiqueta de estado.
 *
 * Os tons são dessaturados de propósito: sobre bege, uma cor saturada vira o
 * assunto da tela, e o assunto deveria ser o pedido — não a etiqueta dele.
 */

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sand-200 text-ink-soft',
  primary: 'bg-clay-100 text-clay-700',
  accent: 'bg-olive-100 text-olive-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Ponto colorido para status com cor livre, definida pela empresa (D18). */
export function Dot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 rounded-full"
      style={{ backgroundColor: color ?? 'var(--color-sand-400)' }}
    />
  );
}
