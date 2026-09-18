import type { Metadata } from 'next';
import Link from 'next/link';

import { CardIcon, CheckIcon, LockIcon, ShieldIcon } from '../../components/layout/icons';
import { priceLabel, trialLabel } from '../../components/landing/config';
import { Wordmark } from '../../components/landing/wordmark';
import { TrialForm } from '../../features/signup/trial-form';

/**
 * Cadastro do teste grátis.
 *
 * Fora do grupo `(app)` de propósito: aquele layout monta o `AuthProvider`,
 * que dispara `/auth/refresh` ao abrir. Esta página é para quem ainda não tem
 * conta — não deve tocar em sessão, e não tocando não tem como vazá-la.
 *
 * O cabeçalho aqui é mínimo: só a marca e a porta de saída para quem caiu no
 * lugar errado. Menu completo numa tela de formulário é convite para abandonar
 * no meio, e é a tela mais cara de abandonar da landing inteira.
 *
 * `noindex`: formulário que pede CPF não tem por que aparecer em busca. Quem
 * chega aqui vem da landing, que é a página indexada — e uma página de coleta
 * de dado pessoal fora do contexto que a explica é o formato preferido de
 * quem monta phishing.
 */

export const metadata: Metadata = {
  title: 'Começar o teste grátis',
  description:
    'Abra sua conta no Cantina: dados da doceria, do responsável e a forma de pagamento da assinatura.',
  robots: { index: false, follow: false },
};

/** Ver a nota em `app/page.tsx`: a CSP com nonce exige render por requisição. */
export const dynamic = 'force-dynamic';

const PASSOS = [
  {
    icon: CheckIcon,
    title: 'Agora: seus dados',
    text: 'Nome da doceria, o endereço da sua vitrine e os dados de quem assina.',
  },
  {
    icon: CardIcon,
    title: 'Em seguida: a forma de pagamento',
    text: 'Você é levada à página do provedor de pagamento para cadastrar o cartão. Nada é cobrado agora.',
  },
  {
    icon: LockIcon,
    title: 'Por último: sua senha',
    text: 'Chega um link no seu e-mail para você criar a senha e entrar no painel. Só você define essa senha.',
  },
];

const GARANTIAS = [
  'Durante o teste, nenhuma cobrança acontece.',
  'Dá para cancelar pelo painel a qualquer momento, sem ligar para ninguém.',
  'O número do cartão é digitado na página do provedor — não passa pelo Cantina.',
  'Seu CPF é usado para emitir a cobrança no seu nome, e para mais nada.',
];

export default function TesteGratisPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-sand-200">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-control" aria-label="Cantina — início">
            <Wordmark />
          </Link>

          <p className="text-sm text-ink-muted">
            Já tem conta?{' '}
            <Link
              href="/entrar"
              className="font-medium text-clay-700 underline underline-offset-4"
            >
              Acessar
            </Link>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-xl">
          <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
            Vamos abrir a sua loja
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">
            São três passos e o primeiro é este. Depois de {trialLabel()}, a assinatura
            fica em {priceLabel()} — e você decide antes disso se continua.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-12">
          <div className="rounded-panel border border-border bg-surface p-5 shadow-soft sm:p-8">
            <TrialForm />
          </div>

          {/* Painel de apoio: responde, sem a pessoa precisar perguntar, as três
              coisas que fazem alguém parar no meio de um cadastro que pede CPF —
              o que vem depois, quando cobram, e quem fica com o quê. */}
          <aside className="space-y-6 lg:sticky lg:top-8">
            <section className="rounded-panel border border-border bg-sand-50 p-5">
              <h2 className="font-display text-base text-ink">Como funciona daqui</h2>

              <ol className="mt-4 space-y-4">
                {PASSOS.map((passo, index) => (
                  <li key={passo.title} className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay-100 text-clay-700">
                      <passo.icon size={15} />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {index + 1}. {passo.title}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                        {passo.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-panel border border-olive-100 bg-olive-50 p-5">
              <h2 className="flex items-center gap-2 font-display text-base text-olive-900">
                <ShieldIcon size={17} className="text-olive-700" />
                O que fica combinado
              </h2>

              <ul className="mt-4 space-y-2.5">
                {GARANTIAS.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-olive-200 text-olive-800">
                      <CheckIcon size={11} />
                    </span>
                    <span className="text-sm leading-relaxed text-olive-900/85">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
