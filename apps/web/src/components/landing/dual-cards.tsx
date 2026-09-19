import { CheckIcon } from '../layout/icons';
import { cn } from '../../lib/cn';
import { CostMockup, PaymentMockup } from './mockups';

/**
 * Os dois cartões coloridos.
 *
 * Não repetem as abas de propósito: lá estão os módulos, aqui estão as duas
 * coisas que a dona da doceria não consegue resolver com Instagram + caderno
 * por mais organizada que seja — receber o sinal junto com a reserva, e saber
 * quanto sobra de cada doce.
 *
 * Framboesa para o dinheiro que ENTRA, caramelo para o que ele CUSTOU. As duas
 * cores só existem nesta página e na timeline; no painel, cor é estado.
 */

interface Card {
  eyebrow: string;
  title: string;
  lead: string;
  bullets: string[];
  tone: 'berry' | 'honey';
  mockup: React.ComponentType<{ className?: string }>;
}

const CARDS: Card[] = [
  {
    eyebrow: 'Pagamento na reserva',
    title: 'A encomenda só ocupa a data depois que o sinal entra',
    lead: 'O pagamento acontece dentro do próprio pedido e a confirmação volta sozinha: você não precisa conferir comprovante em print nem ficar de olho no extrato para saber se pode começar a produzir.',
    bullets: [
      'Sinal, entrada ou valor total: você escolhe por tipo de produto',
      'Confirmação automática assim que o pagamento cai',
      'Bolo grande só sai da fila depois de pago: some o bolo furado',
      'Comprovante da reserva enviado para a cliente sem você digitar nada',
    ],
    tone: 'berry',
    mockup: PaymentMockup,
  },
  {
    eyebrow: 'Custo por receita',
    title: 'Quanto sobra de verdade em cada doce que você vende',
    lead: 'Cadastre a receita uma vez, com insumo e embalagem. O custo se atualiza sozinho quando o preço da compra muda, e você vê o que resta em cada canal de venda, inclusive descontando a comissão de aplicativo.',
    bullets: [
      'Custo recalculado a cada compra registrada, sem refazer planilha',
      'Preço sugerido a partir da margem que você quer, não do chute',
      'Comparação lado a lado: sua vitrine e o aplicativo de entrega',
      'Embalagem, fita e caixa contam no custo, porque contam no bolso',
    ],
    tone: 'honey',
    mockup: CostMockup,
  },
];

const TONE_STYLES = {
  berry: {
    card: 'bg-berry-50 border-berry-100',
    eyebrow: 'text-berry-700',
    title: 'text-berry-900',
    lead: 'text-berry-800/85',
    bullet: 'bg-berry-100 text-berry-700',
    text: 'text-berry-900/85',
  },
  honey: {
    card: 'bg-honey-50 border-honey-100',
    eyebrow: 'text-honey-700',
    title: 'text-honey-900',
    lead: 'text-honey-800/85',
    bullet: 'bg-honey-100 text-honey-700',
    text: 'text-honey-900/85',
  },
};

export function DualCards() {
  return (
    <section className="py-4 sm:py-8">
      <div className="appear-group mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-2 lg:gap-6">
        {CARDS.map((card) => {
          const tone = TONE_STYLES[card.tone];
          const Mockup = card.mockup;

          return (
            <article
              key={card.eyebrow}
              /* Sombra e borda no hover, e não deslocamento: o reveal por
                 rolagem ocupa o `transform` destes cartões (ver `.appear-group`
                 em `globals.css`), e um `translate` daqui seria engolido por
                 ele. Elevação por sombra diz a mesma coisa sem a briga. */
              className={cn(
                'rounded-panel border p-6 shadow-soft transition-shadow duration-300 ease-out hover:shadow-raised sm:p-8',
                tone.card,
              )}
            >
              <p
                className={cn(
                  'text-xs font-medium uppercase tracking-[0.14em]',
                  tone.eyebrow,
                )}
              >
                {card.eyebrow}
              </p>

              <h2
                className={cn(
                  'mt-3 font-display text-2xl leading-snug sm:text-[1.75rem]',
                  tone.title,
                )}
              >
                {card.title}
              </h2>

              <p className={cn('mt-4 leading-relaxed', tone.lead)}>{card.lead}</p>

              <Mockup className="mt-7 shadow-soft" />

              <ul className="mt-6 space-y-3">
                {card.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                        tone.bullet,
                      )}
                    >
                      <CheckIcon size={13} />
                    </span>
                    <span className={cn('text-sm leading-relaxed', tone.text)}>
                      {bullet}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
