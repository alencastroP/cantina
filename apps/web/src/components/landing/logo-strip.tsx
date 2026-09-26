import Image from 'next/image';

/**
 * Faixa de logos de clientes.
 *
 * Três docerias reais, com autorização para aparecer aqui. Os arquivos ficam
 * em `apps/web/public/landing/clientes/` — cada um é a foto de perfil que a
 * própria doceria usa (não um SVG monocromático), então `grayscale` é quem
 * garante que a faixa continua discreta em vez de virar um mosaico colorido
 * competindo com o resto da página.
 *
 * Para adicionar a próxima cliente: arquivo em `clientes/`, uma entrada em
 * `LOGOS` abaixo. `alt` é o nome da doceria — é o que aparece pra quem usa
 * leitor de tela, já que a imagem em si não tem texto legível depois do
 * grayscale.
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
            <li key={logo.name} className="flex justify-center">
              <Image
                src={logo.src}
                alt={logo.name}
                width={96}
                height={96}
                className="h-14 w-14 rounded-full object-cover grayscale opacity-70"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
