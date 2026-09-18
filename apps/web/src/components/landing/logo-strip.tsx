/**
 * Faixa de logos de clientes.
 *
 * Todas as posições são PLACEHOLDER. Logo de cliente numa landing exige
 * autorização por escrito de quem é dono da marca — e inventar seis nomes de
 * doceria para preencher a faixa é propaganda enganosa, não rascunho.
 *
 * Como preencher, quando houver autorização:
 *
 *   1. arquivo SVG (ou PNG @2x) em `apps/web/public/landing/clientes/`;
 *   2. troque o `<span>` do marcador por `<Image ... className="h-7 w-auto" />`
 *      com `alt` = nome da doceria;
 *   3. mantenha `grayscale opacity-60`: a faixa é prova social, não vitrine de
 *      marcas — seis logos coloridos brigam com o resto da página.
 *
 * Enquanto houver UM cliente só, o caminho honesto é apagar esta seção inteira
 * e deixar só o depoimento. Faixa com um logo repetido engana por omissão.
 */
export function LogoStrip() {
  return (
    <section className="border-y border-sand-200 bg-sand-50/60 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="appear text-center text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
          Docerias que já trabalham assim
        </h2>

        <ul className="appear mt-7 grid grid-cols-2 items-center gap-x-6 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="flex justify-center">
              {/* PLACEHOLDER: logo real do cliente, com autorização de uso. */}
              <span className="flex h-9 w-full max-w-[9rem] items-center justify-center rounded-control border border-dashed border-sand-400 text-[0.65rem] font-medium uppercase tracking-widest text-sand-500">
                logo {index + 1}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
