import { METRICS } from './config';

/**
 * Números da plataforma.
 *
 * Cada valor vem de `config.ts` e hoje é `null` — a tela mostra um marcador
 * visível no lugar, e não um número redondo plausível. É a seção onde mais
 * tenta aparecer estatística inventada, e a que mais custa caro quando alguém
 * pergunta de onde veio: "500+ docerias" dito para um cliente que conhece o
 * mercado derruba a conversa inteira, inclusive a parte verdadeira.
 *
 * Com uma cliente só, o caminho honesto é apagar esta seção e deixar o
 * depoimento fazer o trabalho. Ela volta quando os números existirem.
 *
 * Terracota escura, e não o mesmo marrom da seção anterior: duas faixas
 * escuras seguidas na mesma cor viram uma faixa só, longa demais.
 */
export function StatsSection() {
  return (
    <section className="bg-clay-900 py-16 text-clay-50 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="appear mx-auto max-w-2xl text-center font-display text-3xl leading-tight text-sand-50 sm:text-4xl">
          O que já passou por aqui
        </h2>

        <dl className="appear-group mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {METRICS.map((metric) => (
            <div key={metric.label} className="text-center">
              <dt className="sr-only">{metric.label}</dt>

              <dd>
                <p className="font-display text-4xl text-sand-50 sm:text-5xl" data-numeric>
                  {metric.value ?? (
                    /* PLACEHOLDER: número real, medido no banco. Ver `config.ts`. */
                    <span className="text-clay-200/70">[N]</span>
                  )}
                </p>
                <p className="mt-2 text-sm font-medium text-clay-100">{metric.label}</p>
                <p className="mt-1 text-xs text-clay-200/70">{metric.hint}</p>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mx-auto mt-10 max-w-lg text-center text-xs leading-relaxed text-clay-200/60">
          {/* Esta nota sai junto com os marcadores, quando os números entrarem. */}
          Marcadores no lugar dos números: eles só aparecem aqui depois de medidos no
          próprio sistema.
        </p>
      </div>
    </section>
  );
}
