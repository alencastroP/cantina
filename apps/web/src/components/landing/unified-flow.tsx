import { FinanceIcon, OrdersIcon, RecipeIcon, StockIcon, StoreIcon } from '../layout/icons';

/**
 * A corrente: cada parte entrega alguma coisa para a seguinte.
 *
 * Esta seção existe para sustentar a promessa do hero, que é de CENTRALIZAÇÃO.
 * A diferença que ela precisa deixar clara é a que vende o produto: não é que
 * cada assunto ganhou uma tela — cinco telas separadas é o que a dona da loja
 * já tem hoje, espalhadas em cinco aplicativos. É que o dado anda sozinho de
 * uma para a outra.
 *
 * Por isso a ordem importa e é sequencial: começa na vitrine, onde a venda
 * nasce, e termina no fechamento do mês, que é onde ela vira resposta. Cada
 * passo diz o que RECEBE do anterior, e é essa frase que carrega o argumento.
 *
 * Mora no lugar da antiga seção de números (que prometia métricas que ninguém
 * tinha medido) e mantém a mesma faixa escura: sem ela, a página emenda duas
 * seções claras e perde o respiro antes do depoimento.
 */

/* `typeof StoreIcon` e não um tipo próprio: `IconProps` não é exportado, e
   todos os ícones compartilham a mesma assinatura. */
const STEPS: Array<{ icon: typeof StoreIcon; title: string; text: string }> = [
  {
    icon: StoreIcon,
    title: 'Vitrine',
    text: 'Sua cliente monta o pedido no seu endereço, com os tamanhos e recheios que você cadastrou.',
  },
  {
    icon: OrdersIcon,
    title: 'Pedido',
    text: 'Chega inteiro e já somado, seja entrega de hoje ou encomenda com data marcada.',
  },
  {
    icon: StockIcon,
    title: 'Estoque',
    text: 'O insumo da receita sai junto com a venda, do mesmo estoque, sem baixa manual.',
  },
  {
    icon: RecipeIcon,
    title: 'Custo',
    text: 'Cada ficha técnica acompanha o preço da última compra, então a margem é a de hoje.',
  },
  {
    icon: FinanceIcon,
    title: 'Fechamento',
    text: 'O mês termina com o que já passou por aqui, e o relatório abre pronto.',
  },
];

export function UnifiedFlow() {
  return (
    <section className="bg-clay-900 py-16 text-clay-50 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="appear mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl leading-tight text-sand-50 sm:text-4xl">
            Tudo num lugar só
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-clay-100">
            Não é que cada assunto ganhou a própria tela: cinco telas separadas é o que
            você já tem hoje, em cinco aplicativos diferentes. É que aqui uma entrega o
            dado para a outra, e ninguém digita a mesma coisa duas vezes.
          </p>
        </div>

        <ol className="appear-group mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, index) => {
            const Icon = step.icon;

            return (
              <li
                key={step.title}
                className="rounded-panel bg-clay-800/60 p-5 ring-1 ring-clay-700/60"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay-700 text-sand-50">
                    <Icon size={18} />
                  </span>
                  {/* O número é o que transforma cinco cartões soltos numa
                      sequência, agora que eles empilham no celular e a ordem
                      da esquerda para a direita se perde. */}
                  <span
                    aria-hidden="true"
                    className="font-display text-lg text-clay-400"
                    data-numeric
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>

                <h3 className="mt-4 font-display text-xl text-sand-50">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-clay-100">{step.text}</p>
              </li>
            );
          })}
        </ol>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm leading-relaxed text-clay-200/70">
          No lugar do link na bio, do caderno de encomendas, da planilha de custo e da
          soma de comprovante no fim do mês.
        </p>
      </div>
    </section>
  );
}
