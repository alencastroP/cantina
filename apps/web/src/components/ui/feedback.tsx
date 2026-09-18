import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * Estados: carregando, vazio, erro.
 *
 * Ficam entre os primitivos, e não como remendo em cada tela, porque tela que
 * só existe no caminho feliz é tela que ninguém consegue usar num dia ruim.
 */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Bloco cinza-bege que ocupa o lugar do conteúdo enquanto ele carrega. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-control bg-sand-200', className)} />;
}

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'bg-info-50 text-info-700 border-info-500/25',
  success: 'bg-success-50 text-success-700 border-success-500/25',
  warning: 'bg-warning-50 text-warning-700 border-warning-500/25',
  danger: 'bg-danger-50 text-danger-700 border-danger-500/25',
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      // `alert` só para erro: o leitor de tela interrompe o que está lendo, e
      // fazer isso por um aviso informativo é hostil.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-card border px-4 py-3 text-sm',
        ALERT_TONES[tone],
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-1 opacity-90')}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface/60 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-sand-400">{icon}</div> : null}
      <p className="font-display text-lg text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
