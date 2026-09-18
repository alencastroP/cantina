import { cn } from '../../lib/cn';

/**
 * Assinatura da marca: símbolo + palavra.
 *
 * O símbolo é uma tigela com um vapor saindo — desenhado aqui, em traço de
 * 1.75 como o resto dos ícones do sistema, para o cabeçalho não depender de um
 * arquivo de imagem que alguém precisa lembrar de otimizar.
 *
 * A abertura é uma sequência, e a ordem dela é a da leitura: o nome entra
 * primeiro, a tigela se desenha depois e o vapor começa a subir por último.
 * Os tempos e as curvas estão em `globals.css` (`.brand-*` e `--animate-brand-*`),
 * não aqui: é lá que se vê a sequência inteira em quatro linhas seguidas.
 *
 * Tudo em CSS, sem JavaScript nenhum. O componente aparece em toda casca do
 * sistema — landing, painel, admin, autenticação e vitrine —, e uma marca que
 * depende de script é uma marca que pisca em branco quando o script atrasa.
 * Como nenhuma dessas cascas remonta em navegação por dentro dela (são
 * `layout`, não `page`), a abertura toca uma vez por sessão e fica — não
 * replay a cada troca de tela.
 *
 * Os dois fios de vapor são paths SEPARADOS de propósito. Juntos num `d` só,
 * compartilhariam uma origem de transformação e ondulariam colados, como uma
 * peça rígida; separados, cada um gira sobre o próprio pé.
 *
 * `size` existe porque a marca aparece em contextos de peso bem diferente: o
 * cabeçalho da landing e a barra lateral do painel não pedem o mesmo tamanho
 * de letra. As curvas de animação são todas relativas (`em`, `pathLength`,
 * porcentagem) — nenhuma delas precisa saber em qual tamanho está para
 * continuar correta.
 *
 * PLACEHOLDER: se houver logotipo definitivo, troque só o `<svg>` — a palavra
 * em Fraunces e o alinhamento continuam valendo. Mantendo as classes
 * `brand-bowl` e `brand-wisp` nos traços equivalentes, a abertura vem junto.
 */

type Size = 'sm' | 'md' | 'lg';

const ICON_SIZE: Record<Size, number> = {
  sm: 20,
  md: 26,
  lg: 32,
};

const TEXT_SIZE: Record<Size, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
};

const GAP: Record<Size, string> = {
  sm: 'gap-1.5',
  md: 'gap-2',
  lg: 'gap-2.5',
};

export function Wordmark({
  className,
  tone = 'ink',
  size = 'md',
}: {
  className?: string;
  /** `inverse` para as seções escuras e o rodapé. */
  tone?: 'ink' | 'inverse';
  /** `md` é o padrão (cabeçalho da landing). `lg` para telas de entrada e a
   *  barra lateral do painel; `sm` para menções discretas, como o rodapé da
   *  vitrine. */
  size?: Size;
}) {
  const icon = ICON_SIZE[size];

  return (
    <span className={cn('group flex items-center', GAP[size], className)}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 text-clay-500 transition-[transform,color] duration-300 ease-out group-hover:-translate-y-px group-hover:text-clay-600"
      >
        {/* `pathLength="1"` normaliza o comprimento do traço: o dasharray da
            animação não precisa saber a geometria real da tigela. */}
        <path
          className="brand-bowl"
          pathLength={1}
          d="M3.5 11.5h17a8.5 8.5 0 0 1-8.5 8.5 8.5 8.5 0 0 1-8.5-8.5Z"
        />

        <g className="brand-steam">
          <path className="brand-wisp" d="M9.5 8.2c0-1.4 1.6-1.6 1.6-3" />
          <path className="brand-wisp brand-wisp-b" d="M14 8.2c0-1.4 1.6-1.6 1.6-3" />
        </g>
      </svg>

      <span
        className={cn(
          'brand-word font-display font-medium tracking-tight',
          TEXT_SIZE[size],
          tone === 'inverse' ? 'text-sand-50' : 'text-ink',
        )}
      >
        Cantina
      </span>
    </span>
  );
}
