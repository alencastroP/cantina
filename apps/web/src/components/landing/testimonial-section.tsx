import { PhotoPlaceholder } from './photo-placeholder';

/**
 * Depoimento.
 *
 * Um só, e por escolha: dois depoimentos inventados valem menos que um
 * verdadeiro, e com uma cliente ativa é o que existe. Quando for colher o
 * texto, peça o que ela diria a outra doceira — não um elogio ao sistema.
 * "Parei de anotar encomenda no caderno" convence; "excelente plataforma,
 * recomendo" não convence ninguém e ainda soa comprado.
 *
 * Antes de publicar: autorização por escrito para usar nome, foto e nome da
 * loja. Depoimento publicado sem autorização é problema jurídico, não detalhe
 * de landing page.
 *
 * ── Para preencher ───────────────────────────────────────────────────────────
 *   QUOTE  a frase dela, sem revisão de português que apague a voz
 *   NAME   nome, como ela quiser ser chamada
 *   ROLE   "dona da [loja], [cidade]"
 *   FOTO   troque o PhotoPlaceholder por <Image> (ver o componente)
 */

/** PLACEHOLDER: substituir pelos três campos acima. */
const TESTIMONIAL = {
  quote: null as string | null,
  name: null as string | null,
  role: null as string | null,
};

export function TestimonialSection() {
  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Título só para leitor de tela: a seção precisa de nome na estrutura
            do documento, mas um cabeçalho visível aqui competiria com a própria
            citação, que é o que tem de ser lido primeiro. */}
        <h2 className="sr-only">Depoimento de quem usa o Cantina</h2>

        <figure className="appear overflow-hidden rounded-panel border border-border bg-surface shadow-soft sm:grid sm:grid-cols-[13rem_1fr] sm:items-stretch">
          <PhotoPlaceholder
            label="retrato da doceira, na cozinha dela"
            tone="berry"
            className="aspect-4/3 w-full sm:aspect-auto sm:h-full"
          />

          <div className="p-6 sm:p-8 lg:p-10">
            <svg
              width="30"
              height="24"
              viewBox="0 0 30 24"
              fill="currentColor"
              aria-hidden="true"
              className="text-clay-200"
            >
              <path d="M0 24V13.2C0 5.9 4.2 1.4 12 0l1.2 4.2c-4.3 1-6.4 3.2-6.4 6.6H12V24H0Zm17 0V13.2C17 5.9 21.2 1.4 29 0l1.2 4.2c-4.3 1-6.4 3.2-6.4 6.6H29V24H17Z" />
            </svg>

            <blockquote className="mt-4">
              <p className="font-display text-xl leading-snug text-ink sm:text-2xl">
                {TESTIMONIAL.quote ?? (
                  <span className="text-ink-muted">
                    [Depoimento da cliente atual, com a frase dela, colhida e autorizada por
                    escrito.]
                  </span>
                )}
              </p>
            </blockquote>

            <figcaption className="mt-6 border-t border-border pt-4">
              <p className="text-sm font-medium text-ink">
                {TESTIMONIAL.name ?? <span className="text-ink-muted">[Nome]</span>}
              </p>
              <p className="text-sm text-ink-muted">
                {TESTIMONIAL.role ?? '[dona da loja, cidade]'}
              </p>
            </figcaption>
          </div>
        </figure>
      </div>
    </section>
  );
}
