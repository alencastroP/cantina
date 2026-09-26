import Image from 'next/image';

/**
 * Faixa de logos de clientes.
 *
 * Três docerias reais, com autorização para aparecer aqui. Os arquivos ficam
 * em `apps/web/public/landing/clientes/` — cada um é a foto de perfil que a
 * própria doceria usa, mostrada em cor mesmo (sem `grayscale`), e o nome
 * aparece num rótulo ao passar o mouse.
 *
 * Para adicionar a próxima cliente: arquivo em `clientes/`, uma entrada em
 * `LOGOS` abaixo. `name` vira tanto o `alt` da imagem quanto o texto do
 * rótulo de hover.
 */
const LOGOS = [
  { src: '/landing/clientes/unipane.jpg', name: 'UniPane' },
  { src: '/landing/clientes/pulo-do-gato.jpg', name: 'Pulo do Gato' },
  { src: '/landing/clientes/bea-canela.jpg', name: 'bea&canela' },
];

export function LogoStrip() {
  return (
    <section className="border-y border-sand-200 bg-sand-50/60 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="appear text-center text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">
          Docerias que já trabalham assim
        </h2>

        <ul className="appear mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {LOGOS.map((logo) => (
            <li key={logo.name} className="group relative flex justify-center">
              <Image
                src={logo.src}
                alt={logo.name}
                width={96}
                height={96}
                className="h-14 w-14 rounded-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[0.65rem] font-medium text-sand-50 opacity-0 shadow-soft transition-opacity duration-200 ease-out group-hover:opacity-100"
              >
                {logo.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
