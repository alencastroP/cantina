'use client';

import Link from 'next/link';
import {
  LazyMotion,
  domAnimation,
  m,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'motion/react';
import { Fragment, useRef } from 'react';

import { ArrowRightIcon, LockIcon } from '../layout/icons';
import { HeroCardMockup } from './mockups';
import { PhotoPlaceholder } from './photo-placeholder';
import { trialLabel } from './config';

/**
 * Hero.
 *
 * Única `h1` do site. O que ela precisa entregar em uma linha: que tudo da
 * loja vive no mesmo sistema, começando pela vitrine, e que isso não é mais um
 * app de delivery. É com aplicativo de delivery que a dona da doceria vai
 * comparar, e a comissão é o assunto dela.
 *
 * A foto fica à direita e o cartão de UI flutua sobre ela: a foto dá o cheiro
 * do negócio, o cartão prova que existe software. Sozinha, a foto vira anúncio
 * de bolo; sozinho, o cartão vira mais um SaaS cinza.
 *
 * ── Por que ESTA seção tem JavaScript, e as outras não ───────────────────────
 *
 * O resto da landing anima em CSS puro (`.appear`, com `animation-timeline`),
 * e a regra continua valendo: nenhuma outra seção importa nada daqui. O hero é
 * a exceção porque tem três coisas que CSS não faz sem ginástica:
 *
 *   1. orquestração — a entrada é uma linha do tempo com pais e filhos, e não
 *      sete atrasos escritos à mão que alguém vai dessincronizar na primeira
 *      troca de texto;
 *   2. duas fontes de movimento no mesmo elemento — o cartão responde à
 *      ROLAGEM e ao PONTEIRO ao mesmo tempo, e as duas se somam por molas
 *      independentes;
 *   3. interrupção — mexer o mouse no meio de uma transição redireciona a mola
 *      a partir da velocidade atual, em vez de saltar para o novo destino.
 *
 * O custo é contido de propósito. `LazyMotion` com `domAnimation` traz gestos e
 * variantes sem o pacote inteiro, e `strict` faz o build quebrar se alguém
 * escrever `motion.div` em vez de `m.div` aqui dentro — que é justamente o
 * atalho que traz os ~34 KB de volta sem ninguém perceber.
 *
 * ── A rede de segurança ──────────────────────────────────────────────────────
 *
 * `initial` é serializado como `style` no HTML: sem JavaScript, o hero nasceria
 * invisível. O `<noscript>` abaixo devolve tudo. É a diferença entre uma
 * animação e uma página em branco para quem bloqueia script.
 */

/* As palavras do título, viradas uma a uma. Uma constante, e não `split()` no
   corpo do componente: assim a quebra acontece uma vez, e não a cada render. */
const TITLE_WORDS = 'Sua doceria inteira num lugar só, da vitrine ao fim do mês'.split(' ');

export function Hero() {
  /* Ponto de partida do movimento. `null` no servidor e no primeiro quadro, o
     que é esperado: `useScroll` só mede depois da montagem. */
  const stageRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  /**
   * Rolagem: 0 com o hero no topo, 1 quando ele acabou de sair por cima.
   *
   * A paralaxe é discreta por decisão — algumas dezenas de pixels. Hero que
   * desliza muito dá a impressão de que a página não obedece ao dedo, e o
   * primeiro gesto de quem chega numa landing é rolar para ver o que tem
   * embaixo.
   */
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start start', 'end start'],
  });

  const photoY = useTransform(scrollYProgress, [0, 1], [0, 56]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 90]);

  /**
   * Ponteiro: inclina o cartão em direção ao cursor.
   *
   * Guardado em `useMotionValue` e não em estado — mexer o mouse não deve
   * causar render nenhum. A mola existe para o cartão ter inércia: sem ela, o
   * movimento gruda no cursor e parece um adesivo, não um objeto com peso.
   */
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spring = { stiffness: 150, damping: 18, mass: 0.6 };
  const tiltX = useSpring(useTransform(pointerY, [-0.5, 0.5], [7, -7]), spring);
  const tiltY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-9, 9]), spring);

  function trackPointer(event: React.PointerEvent<HTMLDivElement>) {
    /* Toque não inclina: o dedo cobre o cartão, e o gesto de quem toca ali é
       rolar a página — inclinar no `pointermove` do scroll é ruído. */
    if (reduced || event.pointerType !== 'mouse') return;

    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - box.left) / box.width - 0.5);
    pointerY.set((event.clientY - box.top) / box.height - 0.5);
  }

  function releasePointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  /**
   * A entrada, como uma linha do tempo.
   *
   * O pai só distribui o tempo; cada filho descreve o próprio gesto. Trocar a
   * ordem dos blocos no JSX reordena a animação junto, sem tocar em número
   * nenhum — que é a razão de isto não ser uma lista de `animation-delay`.
   */
  const column: Variants = {
    hidden: {},
    shown: {
      transition: { staggerChildren: 0.08, delayChildren: reduced ? 0 : 0.15 },
    },
  };

  const block: Variants = reduced
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 16 },
        shown: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
        },
      };

  /* O título vira palavra por palavra, tombando para cima a partir da base.
     `rotateX` e não desfoque: giro roda no compositor, `filter: blur` repinta —
     e são doze elementos ao mesmo tempo, no celular de alguém. */
  const line: Variants = {
    hidden: {},
    shown: { transition: { staggerChildren: 0.045, delayChildren: reduced ? 0 : 0.2 } },
  };

  const word: Variants = reduced
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: '0.4em', rotateX: -60 },
        shown: {
          opacity: 1,
          y: '0em',
          rotateX: 0,
          transition: { type: 'spring', stiffness: 240, damping: 24, mass: 0.7 },
        },
      };

  return (
    <LazyMotion features={domAnimation} strict>
      <noscript>
        {/* Sem script, `initial` ficaria congelado no HTML e o hero não
            apareceria. Uma landing invisível é pior que uma landing parada. */}
        <style>{`[data-hero-motion]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <section ref={stageRef} className="relative overflow-hidden">
        {/* Borrão quente atrás do texto: sustenta o bege sem virar gradiente.
            Ele deriva com a rolagem em ritmo próprio — é o que dá profundidade
            à seção sem desenhar nenhuma camada a mais. */}
        <m.div
          aria-hidden="true"
          style={{ y: glowY }}
          className="pointer-events-none absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-clay-100/50 blur-3xl"
        />
        <m.div
          aria-hidden="true"
          style={{ y: photoY }}
          className="pointer-events-none absolute -right-24 top-40 h-80 w-80 rounded-full bg-berry-100/40 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-12 lg:pb-28 lg:pt-20">
          <m.div
            variants={column}
            initial="hidden"
            animate="shown"
            className="max-w-xl"
          >
            <m.p
              data-hero-motion
              variants={block}
              className="inline-flex items-center gap-2 rounded-full border border-clay-200 bg-clay-50 px-3 py-1.5 text-xs font-medium text-clay-700"
            >
              Do brigadeiro ao bolo de três andares
            </m.p>

            {/* `perspective` aqui, e não em cada palavra: um ponto de fuga só
                para a linha inteira, senão cada palavra gira no próprio eixo e
                o título parece um mostrador de aeroporto. */}
            <m.h1
              variants={line}
              style={{ perspective: '800px' }}
              className="mt-5 font-display text-4xl leading-[1.08] text-ink sm:text-5xl lg:text-6xl"
            >
              {TITLE_WORDS.map((text, index) => (
                <Fragment key={`${text}-${index}`}>
                  <m.span
                    data-hero-motion
                    variants={word}
                    style={{ transformOrigin: '50% 100%' }}
                    className="inline-block"
                  >
                    {text}
                  </m.span>{' '}
                </Fragment>
              ))}
            </m.h1>

            <m.p
              data-hero-motion
              variants={block}
              className="mt-5 text-lg leading-relaxed text-ink-soft sm:text-xl"
            >
              A vitrine que sua cliente abre no celular, o pedido chegando pelo WhatsApp, a
              agenda de encomendas, o estoque de insumo, o custo real de cada receita e o
              fechamento do mês. Um sistema só, em que cada parte alimenta a seguinte: sem
              planilha paralela, sem caderno e sem comissão de aplicativo.
            </m.p>

            <m.div
              data-hero-motion
              variants={block}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <m.span
                className="inline-flex"
                whileHover="hover"
                whileTap="tap"
                variants={{ hover: { scale: 1.02 }, tap: { scale: 0.97 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Link
                  href="/teste-gratis"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-medium text-ink-inverse shadow-soft transition-shadow duration-300 hover:bg-primary-hover hover:shadow-raised"
                >
                  Começar {trialLabel()}
                  {/* A seta anda porque o PAI está sob o mouse: a variante
                      desce a árvore, então o ícone não precisa saber que existe
                      um botão em volta dele. */}
                  <m.span
                    variants={{ hover: { x: 4 } }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="inline-flex"
                  >
                    <ArrowRightIcon size={18} />
                  </m.span>
                </Link>
              </m.span>

              <m.span
                className="inline-flex"
                whileHover="hover"
                whileTap="tap"
                variants={{ hover: { scale: 1.02 }, tap: { scale: 0.97 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <a
                  href="#vender"
                  className="inline-flex w-full items-center justify-center rounded-full border border-border bg-surface px-7 py-3.5 text-base font-medium text-ink transition-colors duration-200 hover:border-border-strong hover:bg-sand-100"
                >
                  Ver o que tem dentro
                </a>
              </m.span>
            </m.div>

            {/*
              A condição do teste aparece ANTES do clique, não na tela de cadastro.
              Descobrir que precisa de cartão depois de preencher meia página é a
              forma mais rápida de perder alguém que estava disposta a assinar.
            */}
            <m.p
              data-hero-motion
              variants={block}
              className="mt-4 flex items-start gap-2 text-sm text-ink-muted"
            >
              <LockIcon size={15} className="mt-0.5 shrink-0" />
              <span>
                Pedimos CPF e uma forma de pagamento para começar. A cobrança só acontece
                quando o teste termina, e dá para cancelar antes disso pelo painel. O cartão
                é digitado na página do banco, nunca aqui.
              </span>
            </m.p>
          </m.div>

          {/* Foto + cartão flutuando. No celular o cartão desce para baixo da
              foto: sobreposto numa tela de 360px, um esconde o outro. */}
          <div
            className="relative"
            onPointerMove={trackPointer}
            onPointerLeave={releasePointer}
            style={{ perspective: '1000px' }}
          >
            <m.div
              data-hero-motion
              style={{ y: photoY }}
              initial={reduced ? false : { opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
              <PhotoPlaceholder
                label="bancada da doceria com bolos e caixas prontos para sair"
                className="aspect-4/3 w-full rounded-panel shadow-raised sm:aspect-3/2 lg:aspect-4/3"
              />
            </m.div>

            {/* Três movimentos empilhados, um por camada, porque todos escrevem
                em `transform` e brigariam pelo mesmo elemento: fora a rolagem,
                no meio a inclinação pelo ponteiro, dentro a respiração. */}
            <m.div
              style={{ y: cardY }}
              className="mx-auto -mt-10 w-fit sm:absolute sm:-bottom-8 sm:-left-6 sm:mt-0 lg:-left-10"
            >
              <m.div
                style={{ rotateX: tiltX, rotateY: tiltY, transformStyle: 'preserve-3d' }}
              >
                <m.div
                  data-hero-motion
                  initial={reduced ? false : { opacity: 0, y: 28, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 180,
                    damping: 20,
                    delay: 0.45,
                  }}
                >
                  {/* A respiração é o que impede o cartão de parecer uma captura
                      de tela colada sobre a foto. Amplitude de 6px: perceptível
                      de canto de olho, invisível quando se olha direto. */}
                  <m.div
                    animate={reduced ? undefined : { y: [0, -6, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <HeroCardMockup />
                  </m.div>
                </m.div>
              </m.div>
            </m.div>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}
