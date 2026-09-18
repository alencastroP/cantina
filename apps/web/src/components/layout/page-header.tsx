import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Cabeçalho de página do painel.
 *
 * O "voltar" é um link de verdade, não `history.back()`: quem chega por um
 * link direto (do WhatsApp da equipe, de um favorito) não tem histórico para
 * voltar, e o botão não faria nada.
 */
export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back ? (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {back.label}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-ink lg:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
