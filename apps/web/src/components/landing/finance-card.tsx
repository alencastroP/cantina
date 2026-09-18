import { CheckIcon } from '../layout/icons';
import { FinanceMockup } from './mockups';

/**
 * Financeiro, sozinho num cartão largo.
 *
 * Ganha a seção inteira porque é o módulo que fecha o argumento: os outros
 * organizam o dia, este responde "e valeu a pena?". Vem depois dos cartões
 * coloridos pela mesma razão — o mês só fecha quando tudo já aconteceu.
 */
const BULLETS = [
  'O que entrou já vem lançado, de cada pedido pago na vitrine e em encomenda',
  'As saídas ficam por categoria: insumo, embalagem, gás, a ajuda de sábado',
  'Mês a mês lado a lado — dá para ver se dezembro foi mesmo melhor que novembro',
  'Relatório por produto separa o que vende bem do que só dá trabalho',
];

export function FinanceCard() {
  return (
    <section id="financeiro" className="scroll-mt-24 py-4 sm:py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <article className="appear rounded-panel border border-olive-100 bg-olive-50 p-6 sm:p-8 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-olive-700">
                Financeiro e relatórios
              </p>

              <h2 className="mt-3 font-display text-2xl leading-snug text-olive-900 sm:text-3xl lg:text-4xl">
                No fim do mês, o número já está pronto
              </h2>

              <p className="mt-4 leading-relaxed text-olive-800/85">
                Sem a noite de domingo somando comprovante, conferindo extrato e tentando
                lembrar quanto custou aquela compra de chocolate. O que passou pela loja
                já está lançado; você completa o que saiu e o mês fecha.
              </p>

              <ul className="mt-7 space-y-3">
                {BULLETS.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-olive-200 text-olive-800">
                      <CheckIcon size={13} />
                    </span>
                    <span className="text-sm leading-relaxed text-olive-900/85">
                      {bullet}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <FinanceMockup className="shadow-soft" />
          </div>
        </article>
      </div>
    </section>
  );
}
