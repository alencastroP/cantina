import Link from 'next/link';

import { ArrowRightIcon, LockIcon } from '../layout/icons';
import { priceLabel, trialLabel } from './config';

/**
 * Última chamada, antes do rodapé.
 *
 * Repete a condição do teste — cartão e CPF — pela terceira vez na página. Não
 * é descuido: quem rolou até aqui provavelmente não leu o hero com atenção, e
 * a surpresa no formulário é o que faz alguém fechar a aba no meio do
 * cadastro.
 */
export function FinalCta() {
  return (
    <section className="px-4 pb-16 pt-4 sm:px-6 sm:pb-20">
      <div className="appear mx-auto max-w-6xl overflow-hidden rounded-panel bg-night px-6 py-14 text-center sm:px-10 sm:py-20">
        <h2 className="mx-auto max-w-2xl font-display text-3xl leading-tight text-sand-50 sm:text-4xl lg:text-5xl">
          Amanhã de manhã o pedido já pode chegar pronto
        </h2>

        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-sand-300">
          Abra a conta, monte a vitrine com a gente e mande o link para as suas clientes.
          O caderno pode ficar na gaveta.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/teste-gratis"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-medium text-ink-inverse shadow-soft transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-primary-hover hover:shadow-raised active:scale-[0.98] sm:w-auto"
          >
            Começar {trialLabel()}
            <ArrowRightIcon
              size={18}
              className="transition-transform duration-200 ease-out group-hover:translate-x-1"
            />
          </Link>

          <Link
            href="/entrar"
            className="inline-flex w-full items-center justify-center rounded-full border border-sand-700 px-7 py-3.5 text-base font-medium text-sand-100 transition-[background-color,border-color,transform] duration-200 ease-out hover:border-sand-600 hover:bg-night-soft active:scale-[0.98] sm:w-auto"
          >
            Já sou cliente, quero acessar
          </Link>
        </div>

        <p className="mx-auto mt-6 flex max-w-lg items-start justify-center gap-2 text-sm text-sand-400">
          <LockIcon size={15} className="mt-0.5 shrink-0" />
          <span>
            Depois do teste, {priceLabel()}. Pedimos CPF e forma de pagamento na entrada, e
            o cartão é digitado na página do provedor — não nas nossas.
          </span>
        </p>
      </div>
    </section>
  );
}
