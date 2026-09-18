import Link from 'next/link';
import type { ReactNode } from 'react';

import { Wordmark } from '../../components/landing/wordmark';

/**
 * Casca das páginas legais.
 *
 * Fora do grupo `(app)`: documento público não precisa de sessão, e uma página
 * que qualquer pessoa abre não deveria disparar `/auth/refresh` por tabela.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-sand-200">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-control" aria-label="Cantina — início">
            <Wordmark />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">{children}</main>
    </div>
  );
}
