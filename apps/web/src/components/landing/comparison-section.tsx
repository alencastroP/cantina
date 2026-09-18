import { CheckIcon } from '../layout/icons';

/**
 * Antes e depois, em duas colunas.
 *
 * A coluna da esquerda é a parte difícil de escrever: precisa ser específica o
 * bastante para a pessoa se reconhecer ("sete mensagens", "caderno que só você
 * entende") sem soar como deboche de quem trabalha assim há dez anos. O tom é
 * de quem já viu a cena, não de quem está julgando.
 *
 * As linhas são pareadas na ordem: cada dor da esquerda tem sua resposta na
 * mesma altura à direita. No celular as colunas empilham, e por isso cada uma
 * carrega seu próprio título — senão a segunda lista chega sem contexto.
 */

const PAIRS: Array<{ before: string; after: string }> = [
  {
    before: 'O pedido chega em sete mensagens e você monta a conta de cabeça',
    after: 'Chega um pedido só, com item, tamanho, endereço e total já somados',
  },
  {
    before: 'A encomenda de sábado está num caderno que só você entende',
    after: 'A agenda é a mesma para você e para quem compra, e ninguém decifra nada',
  },
  {
    before: 'Duas clientes marcaram o mesmo domingo, as duas querem três andares',
    after: 'O dia trava sozinho ao encher: a segunda nem vê a data como opção',
  },
  {
    before: 'Você descobre que acabou o chantilly na hora de bater',
    after: 'O aviso de estoque baixo chega dias antes, com a encomenda já contada',
  },
  {
    before: 'O preço é o mesmo de dois anos atrás, com o chocolate muito mais caro',
    after: 'O custo se atualiza junto com a nota da compra, e o preço acompanha',
  },
  {
    before: 'No fim do mês você soma comprovante de Pix no sofá, de madrugada',
    after: 'O mês fecha com o que já foi lançado, e o relatório abre pronto',
  },
  {
    before: 'O aplicativo leva a comissão e fica com o cadastro da sua cliente',
    after: 'A vitrine é sua, o cadastro é seu, e não existe comissão por pedido',
  },
];

export function ComparisonSection() {
  return (
    <section id="comparativo" className="scroll-mt-24 py-16 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="appear mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
            Nada disso é desorganização sua
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            É o que acontece quando a loja cresce e as ferramentas continuam sendo o
            caderno, a conversa e a memória. Elas aguentam até certo ponto.
          </p>
        </div>

        <div className="appear-group mt-12 grid gap-4 lg:grid-cols-2 lg:gap-6">
          {/* Coluna da dor: apagada de propósito — é o que se quer deixar para trás. */}
          <div className="rounded-panel border border-sand-300 bg-sand-200/50 p-6 sm:p-8">
            <h3 className="font-display text-xl text-ink-soft">Uma semana normal hoje</h3>

            <ul className="mt-6 space-y-4">
              {PAIRS.map((pair) => (
                <li key={pair.before} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-sand-500"
                  />
                  <span className="text-sm leading-relaxed text-ink-muted">
                    {pair.before}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Coluna da marca: terracota cheia, com o contraste que a outra não tem. */}
          <div className="rounded-panel bg-clay-600 p-6 text-sand-50 sm:p-8">
            <h3 className="font-display text-xl text-sand-50">A mesma semana com o Cantina</h3>

            <ul className="mt-6 space-y-4">
              {PAIRS.map((pair) => (
                <li key={pair.after} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-clay-500 text-sand-50">
                    <CheckIcon size={13} />
                  </span>
                  <span className="text-sm leading-relaxed text-clay-50">{pair.after}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
