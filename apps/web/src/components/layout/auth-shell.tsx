import Link from 'next/link';
import type { ReactNode } from 'react';

import { Wordmark } from '../landing/wordmark';

/**
 * Moldura das telas de acesso: entrar e recuperar senha.
 *
 * No desktop, duas colunas — o formulário à esquerda e, à direita, um painel
 * da marca em terracota e oliva: quem chega reconhece onde está antes de ler
 * qualquer coisa. No celular fica só o formulário. A coluna decorativa não
 * vale o espaço de quem está com o polegar no campo de senha.
 *
 * O título é um `<h1>` de verdade: é a primeira coisa que o leitor de tela
 * anuncia, e "Cantina" sozinho não diz o que fazer na página.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="inline-flex rounded-control" aria-label="Cantina — início">
            <Wordmark size="lg" />
          </Link>

          <h1 className="mt-10 font-display text-3xl text-ink">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>

          {footer ? <div className="mt-8 text-sm text-ink-muted">{footer}</div> : null}
        </div>
      </div>

      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-clay-500 lg:block">
        {/* Manchas de luz em vez de ilustração: calor sem peso de imagem. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,var(--color-clay-300)_0,transparent_42%),radial-gradient(circle_at_82%_68%,var(--color-olive-400)_0,transparent_38%),radial-gradient(circle_at_58%_8%,var(--color-sand-200)_0,transparent_30%)] opacity-80" />
        <div className="absolute -bottom-24 -left-16 size-96 rounded-full bg-clay-700/40 blur-3xl" />

        <div className="relative flex h-full flex-col justify-end p-12 text-ink-inverse">
          <p className="max-w-md font-display text-4xl leading-tight">
            Do forno ao balcão, com a conta certa.
          </p>
          <p className="mt-4 max-w-sm text-sand-100/90">
            Encomendas, estoque e o custo de cada receita, no mesmo lugar.
          </p>
        </div>
      </aside>
    </main>
  );
}
