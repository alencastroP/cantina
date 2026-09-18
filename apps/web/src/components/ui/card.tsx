import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * Cartão.
 *
 * Superfície mais clara que o fundo — nunca branco puro, que sobre bege
 * parece um recorte de papel de outro projeto.
 */
export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface shadow-soft',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
