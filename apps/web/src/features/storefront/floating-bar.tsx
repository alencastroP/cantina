'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowRightIcon } from '../../components/layout/icons';
import { cn } from '../../lib/cn';

/**
 * Pílula flutuante no rodapé — a sacola no delivery, o resumo na encomenda.
 *
 * Escura sobre o bege, para ser a coisa mais visível da tela sem gritar em
 * laranja; o círculo da esquerda carrega a cor do modo. Sobe com mola na
 * primeira aparição e o contador pula a cada item: o retorno do "adicionei"
 * acontece onde o polegar já está, sem toast.
 */
export function FloatingBar({
  href,
  onClick,
  icon,
  count,
  title,
  subtitle,
  amount,
  progress,
  visible = true,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  count: number;
  title: string;
  subtitle: string;
  amount: string;
  /** 0 a 1 — a linha fina que enche até o pedido mínimo. */
  progress?: number;
  visible?: boolean;
}) {
  const content = (
    <>
      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-mode text-ink-inverse">
        {icon}
        <span
          key={count}
          className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-bump place-items-center rounded-full bg-surface px-1 text-[11px] font-bold text-mode-ink ring-2 ring-ink"
          data-numeric
        >
          {count}
        </span>
      </span>

      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[0.95rem] font-medium">{title}</span>
        <span className="block truncate text-xs text-ink-inverse/65">{subtitle}</span>
      </span>

      <span className="font-semibold" data-numeric>
        {amount}
      </span>
      <ArrowRightIcon size={18} className="shrink-0 opacity-60" />

      {progress !== undefined ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-6 bottom-0 h-[3px] overflow-hidden rounded-full bg-ink-inverse/10"
        >
          <span
            className="block h-full rounded-full bg-mode transition-[width] duration-700 ease-[var(--ease-out-soft)]"
            style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }}
          />
        </span>
      ) : null}
    </>
  );

  const className =
    'pointer-events-auto relative mx-auto flex w-full max-w-md animate-float-up items-center gap-3 rounded-full bg-ink py-2 pl-2 pr-4 text-left text-ink-inverse shadow-[0_20px_40px_-14px_rgb(46_38_29/0.6)] transition-transform duration-200 active:scale-[0.98]';

  return (
    <div
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[translate,opacity] duration-300 ease-[var(--ease-out-soft)]',
        !visible && 'translate-y-[140%] opacity-0',
      )}
    >
      {href ? (
        <Link href={href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </div>
  );
}
