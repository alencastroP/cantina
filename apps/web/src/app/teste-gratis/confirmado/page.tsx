import type { Metadata } from 'next';
import Link from 'next/link';

import { CheckIcon } from '../../../components/layout/icons';
import { trialLabel } from '../../../components/landing/config';
import { Wordmark } from '../../../components/landing/wordmark';

/**
 * Volta do checkout do provedor, depois que o cartão foi validado.
 *
 * Esta página NÃO confirma nada por conta própria: ela é só o `successUrl` do
 * checkout, e qualquer um pode abrir o endereço. Quem libera a conta é o
 * webhook do gateway, e o sinal de que isso aconteceu é o e-mail com o link
 * de senha — por isso o texto manda a pessoa para a caixa de entrada, e não
 * para o painel.
 */

export const metadata: Metadata = {
  title: 'Cartão validado',
  robots: { index: false, follow: false },
};

/** Ver a nota em `app/page.tsx`: a CSP com nonce exige render por requisição. */
export const dynamic = 'force-dynamic';

export default function TesteGratisConfirmadoPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-sand-200">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Link href="/" className="rounded-control" aria-label="Cantina — início">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-14 sm:px-6 sm:py-20">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-olive-100 text-olive-800">
          <CheckIcon size={22} />
        </span>

        <h1 className="mt-6 font-display text-3xl leading-tight text-ink sm:text-4xl">
          Cartão validado. Nada foi cobrado.
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          Seus {trialLabel()} começaram. Enviamos para o seu e-mail o link para criar a
          senha e entrar no painel — pode levar alguns minutos para chegar.
        </p>

        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Não achou? Confira a pasta de spam ou promoções. A primeira cobrança só acontece
          quando o teste terminar, e cancelando pelo painel antes disso nada é cobrado.
        </p>
      </main>
    </div>
  );
}
