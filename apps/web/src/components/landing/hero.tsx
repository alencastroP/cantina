'use client';

import Link from 'next/link';
import {
  LazyMotion,
  MotionConfig,
  domMax,
  m,
  useScroll,
  useTransform,
  type Variants,
} from 'motion/react';
import { Fragment, useRef } from 'react';

import { ArrowRightIcon, LockIcon } from '../layout/icons';
import { HeroStage } from './hero-stage';
import { trialLabel } from './config';

/**
 * Hero.
 *
 * Única `h1` do site. O que ela precisa entregar em uma linha: que tudo da
 * loja vive no mesmo sistema, começando pela vitrine, e que isso não é mais um
 * app de delivery. É com aplicativo de delivery que a dona da doceria vai
 * comparar, e a comissão é o assunto dela.
 *
 * ── Objetivo de comunicação ──────────────────────────────────────────────────
 *
 * "Um pedido entra e o resto se resolve sozinho." Não é apetite (a foto de bolo
 * que ela já tem no Instagram) nem controle abstrato (dashboard de SaaS). É a
 * corrente: vitrine → WhatsApp → produção → estoque → fim do mês.
 *
 * A metade direita era uma foto — que ainda não existe, e um bloco bege vazio
 * com um cartão pequeno por cima. Virou um palco escuro onde essa corrente
 * acontece em loop (`hero-stage.tsx`). Escuro de propósito: no meio de uma
 * página bege, o bloco marrom é a coisa de maior contraste da primeira dobra,
 * e é para lá que o olho vai depois do título.
 *
 * ── Por que ESTA seção tem JavaScript, e as outras não ───────────────────────
 *
 * O resto da landing anima em CSS puro (`.appear`, com `animation-timeline`),
 * e a regra continua valendo: nenhuma outra seção importa nada daqui. O hero é
 * a exceção porque tem coisas que CSS não faz sem ginástica:
 *
 *   1. orquestração — a entrada é uma linha do tempo com pais e filhos, e não
 *      sete atrasos escritos à mão que alguém vai dessincronizar na primeira
 *      troca de texto;
 *   2. estado — o palco conta uma história com cinco etapas que dependem umas
 *      das outras (o cartão só anda depois do aviso, o caixa só soma depois do
 *      cartão ficar pronto);
 *   3. layout compartilhado — o cartão de pedido muda de coluna no DOM e
 *      precisa ANDAR até lá, não sumir e reaparecer.
 *
 * O item 3 é o motivo de `domMax` em vez de `domAnimation`: são alguns KB a
 * mais, pagos pela única animação da página que carrega argumento. `strict`
 * continua fazendo o build quebrar se alguém escrever `motion.div` em vez de
 * `m.div` aqui dentro — o atalho que traz o pacote inteiro de volta.
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

/**
 * A entrada, como uma linha do tempo.
 *
 * O pai só distribui o tempo; cada filho descreve o próprio gesto. Trocar a
 * ordem dos blocos no JSX reordena a animação junto, sem tocar em número
 * nenhum — que é a razão de isto não ser uma lista de `animation-delay`.
 *
 * Nenhuma variante olha para "reduzir movimento": quem cuida disso é o
 * `MotionConfig` lá embaixo. Ramificar aqui fazia o HTML do servidor (que não
 * sabe da preferência) divergir do primeiro render do cliente.
 */
const column: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

const block: Variants = {
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
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.2 } },
};

const word: Variants = {
  hidden: { opacity: 0, y: '0.4em', rotateX: -60 },
  shown: {
    opacity: 1,
    y: '0em',
    rotateX: 0,
    transition: { type: 'spring', stiffness: 240, damping: 24, mass: 0.7 },
  },
};

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  /* Só o brilho de fundo deriva com a rolagem. O palco fica parado: ele já se
     mexe por dentro, e dois movimentos no mesmo bloco viram enjoo. */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 90]);

  return (
    <LazyMotion features={domMax} strict>
      {/* `reducedMotion="user"`: com a preferência ligada, o Motion descarta
          deslocamento, giro e escala e deixa só o esmaecer — que não causa
          enjoo e não exige um segundo roteiro escrito à mão. */}
      <MotionConfig reducedMotion="user">
        <noscript>
          {/* Sem script, `initial` ficaria congelado no HTML e o hero não
              apareceria. Uma landing invisível é pior que uma landing parada. */}
          <style>{`[data-hero-motion]{opacity:1!important;transform:none!important}`}</style>
        </noscript>

        <section ref={sectionRef} className="relative overflow-hidden">
          {/* Borrão quente atrás do texto: sustenta o bege sem virar gradiente. */}
          <m.div
            aria-hidden="true"
            style={{ y: glowY }}
            className="pointer-events-none absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-clay-100/50 blur-3xl"
          />
          {/* Faixa de berry atrás do palco, sangrando para a direita. Ancora o
              bloco escuro na página — sem ela ele flutua solto sobre o bege —
              e é o ritmo de bloco de cor que a referência usa. Só no desktop:
              no celular, o palco já ocupa a largura toda. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-16 left-[58%] right-0 hidden rounded-l-[2.5rem] bg-berry-100/70 lg:block"
          />

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:pb-16 lg:pt-20">
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
                className="mt-5 font-display text-4xl leading-[1.08] text-ink sm:text-5xl lg:text-[3.5rem]"
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
                className="mt-5 text-lg leading-relaxed text-ink-soft"
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

            <m.div
              data-hero-motion
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
            >
              <HeroStage />
            </m.div>
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  );
}
