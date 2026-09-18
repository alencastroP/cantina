import { cn } from '../../lib/cn';

/**
 * Lugar reservado para uma FOTO REAL.
 *
 * Existe para que nenhuma foto de banco de imagens entre na página por
 * descuido: uma doceria de verdade fotografada mal converte melhor do que uma
 * cozinha americana genérica com iluminação de estúdio, e a segunda ainda
 * carrega risco de licença.
 *
 * ── Como trocar pela foto de verdade ─────────────────────────────────────────
 *
 *   1. coloque o arquivo em `apps/web/public/landing/` (veja o README de lá);
 *   2. substitua a chamada deste componente por:
 *
 *        import Image from 'next/image';
 *
 *        <Image
 *          src="/landing/bancada.jpg"
 *          alt="Bancada de uma doceria com bolos prontos para entrega"
 *          width={1280}
 *          height={960}
 *          className="h-full w-full object-cover"
 *          priority            // só na foto do hero
 *        />
 *
 *   3. o `alt` descreve a CENA, não o produto: quem usa leitor de tela ganha a
 *      mesma informação que a foto dá a quem enxerga.
 *
 * Enquanto a foto não chega, o bloco desenha uma cena abstrata em CSS — massa,
 * bancada e luz de janela — para o layout ser avaliado com peso visual real, e
 * não com um retângulo cinza que engana o julgamento de espaçamento.
 */
export function PhotoPlaceholder({
  label,
  className,
  tone = 'warm',
}: {
  /** O que esta foto vai mostrar. Aparece na tela até a foto existir. */
  label: string;
  className?: string;
  tone?: 'warm' | 'berry' | 'dark';
}) {
  const TONES = {
    warm: 'from-sand-300 via-sand-200 to-clay-100',
    berry: 'from-berry-200 via-sand-200 to-honey-100',
    dark: 'from-sand-700 via-sand-800 to-sand-900',
  };

  return (
    <div
      role="img"
      aria-label={`Espaço reservado para foto: ${label}`}
      className={cn(
        'relative isolate overflow-hidden bg-gradient-to-br',
        TONES[tone],
        className,
      )}
    >
      {/* Luz de janela entrando de canto — o que dá volume ao bloco. */}
      <div
        aria-hidden="true"
        className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-sand-50/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-clay-300/30 blur-3xl"
      />

      <div className="absolute inset-0 flex items-end p-4">
        <p
          className={cn(
            'rounded-control px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm',
            tone === 'dark'
              ? 'bg-sand-900/70 text-sand-200'
              : 'bg-sand-50/80 text-ink-soft',
          )}
        >
          {/* PLACEHOLDER: trocar por foto real — ver comentário do componente. */}
          Foto: {label}
        </p>
      </div>
    </div>
  );
}
