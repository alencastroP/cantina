import Link from 'next/link';

import { ArrowRightIcon } from '../layout/icons';
import { cn } from '../../lib/cn';
import { trialLabel } from './config';

/**
 * Como começar, em três passos.
 *
 * O medo que trava a decisão nunca é o preço — é "vou ter que cadastrar
 * produto por produto, de noite, depois de fechar". Por isso o passo 2 é o
 * mais importante da seção: alguém faz junto, a partir do material que já
 * existe (print do Instagram, foto do caderno, planilha).
 *
 * Cada passo em um pastel diferente, na ordem framboesa → caramelo → oliva:
 * a sequência é a mesma da página, e termina no verde do módulo que fecha o
 * mês. Pastel porque estes cartões são um respiro entre duas seções densas.
 */

const STEPS = [
  {
    step: 'Passo 1',
    title: 'Você abre a conta',
    text: 'Nome da doceria, seus dados e a forma de pagamento do plano. São poucos minutos, sem contrato para assinar e sem conversa com vendedor antes de ver o sistema.',
    tone: 'berry',
  },
  {
    step: 'Passo 2',
    title: 'A gente monta o cardápio com você',
    text: 'Manda a lista do jeito que ela existe hoje: print do Instagram, planilha, foto do caderno. Cadastramos junto — você não vai passar a madrugada digitando preço de brigadeiro.',
    tone: 'honey',
  },
  {
    step: 'Passo 3',
    title: 'Você manda o link para as clientes',
    text: 'No mesmo dia já dá para receber pedido. Ficha técnica e estoque você preenche com calma depois, um produto por vez, sem travar a venda enquanto isso.',
    tone: 'olive',
  },
] as const;

const TONES = {
  berry: {
    card: 'bg-berry-50 border-berry-100',
    step: 'bg-berry-500 text-sand-50',
    title: 'text-berry-900',
    text: 'text-berry-900/80',
  },
  honey: {
    card: 'bg-honey-50 border-honey-100',
    step: 'bg-honey-500 text-sand-50',
    title: 'text-honey-900',
    text: 'text-honey-900/80',
  },
  olive: {
    card: 'bg-olive-50 border-olive-100',
    step: 'bg-olive-600 text-sand-50',
    title: 'text-olive-900',
    text: 'text-olive-900/80',
  },
};

export function OnboardingTimeline() {
  return (
    <section id="comecar" className="scroll-mt-24 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="appear mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
            Dá para estar vendendo antes do fim da semana
          </h2>
          {/* Afirmação de prazo: manter alinhada com o que o onboarding real
              entrega. Se o cadastro do cardápio passar a demorar mais, esta
              frase muda junto — promessa de landing vira reclamação de suporte. */}
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            Sem migração complicada, sem treinamento de uma semana e sem precisar parar a
            produção para aprender sistema.
          </p>
        </div>

        <ol className="appear-group mt-12 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {STEPS.map((item) => {
            const tone = TONES[item.tone];

            return (
              <li
                key={item.step}
                className={cn(
                  'rounded-panel border p-6 transition-shadow duration-300 ease-out hover:shadow-raised sm:p-7',
                  tone.card,
                )}
              >
                <span
                  className={cn(
                    'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                    tone.step,
                  )}
                >
                  {item.step}
                </span>

                <h3 className={cn('mt-4 font-display text-xl leading-snug', tone.title)}>
                  {item.title}
                </h3>
                <p className={cn('mt-3 text-sm leading-relaxed', tone.text)}>{item.text}</p>
              </li>
            );
          })}
        </ol>

        <div className="appear mt-10 text-center">
          <Link
            href="/teste-gratis"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-medium text-ink-inverse shadow-soft transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-primary-hover hover:shadow-raised active:scale-[0.98]"
          >
            Começar {trialLabel()}
            {/* A seta anda um passo à frente do texto quando o botão está sob o
                mouse — a direção do gesto dita a direção do movimento. */}
            <ArrowRightIcon
              size={18}
              className="transition-transform duration-200 ease-out group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
