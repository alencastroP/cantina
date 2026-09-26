'use client';

import {
  AnimatePresence,
  LayoutGroup,
  m,
  useInView,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { CheckIcon, ChatIcon, FinanceIcon, StockIcon } from '../layout/icons';
import { cn } from '../../lib/cn';

/**
 * O palco do hero: um pedido atravessando a loja inteira.
 *
 * O título promete "da vitrine ao fim do mês" e o parágrafo promete que "cada
 * parte alimenta a seguinte". Isso é uma afirmação sobre CAUSA, e causa só se
 * mostra no tempo: numa imagem parada, cinco telas lado a lado são cinco
 * recursos; em sequência, são uma corrente. É por isso que aqui existe
 * movimento — não para enfeitar, mas porque o argumento é temporal.
 *
 * O ciclo, uma volta por pedido:
 *
 *   vitrine     a cliente toca "Enviar pedido" no celular
 *   pedido      o aviso do WhatsApp chega e o cartão cai em "Novos"
 *   produção    o cartão anda para "No forno"
 *   estoque     o insumo da receita baixa sozinho
 *   fim do mês  o cartão fica pronto e o total do mês soma
 *
 * A trilha no rodapé do palco nomeia a etapa em curso. Sem ela, quem olha vê
 * coisas se mexendo; com ela, lê a frase do título acontecendo. Os rótulos
 * são os mesmos da seção "Tudo num lugar só" (`unified-flow.tsx`), que
 * retoma esta corrente mais abaixo: a página inteira fala uma língua só.
 *
 * Os concorrentes que vendem para o mesmo público (cardápio digital com pedido
 * no WhatsApp) param na vitrine: mostram o celular com o cardápio e acabou.
 * O que só a Cantina tem é o que acontece DEPOIS do pedido — e é isso que o
 * palco ocupa a maior parte do espaço mostrando.
 *
 * Tudo aqui é desenho de uma doceria imaginária, como em `mockups.tsx`: sem
 * nome de cliente, sem telefone, e os valores são ilustração de tela, não
 * métrica da plataforma. Para leitor de tela, o palco inteiro é uma imagem com
 * uma descrição — narrar cada cartão que se move seria ruído a cada dois
 * segundos.
 */

/* -------------------------------------------------------------------------- */
/* Roteiro                                                                     */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { label: 'Vitrine', ms: 1700 },
  { label: 'Pedido', ms: 1900 },
  { label: 'Produção', ms: 1600 },
  { label: 'Estoque', ms: 1700 },
  { label: 'Fim do mês', ms: 2300 },
] as const;

const LAST_STEP = STEPS.length - 1;

type Tone = 'clay' | 'olive';

interface Order {
  code: string;
  product: string;
  detail: string;
  total: number;
  /** Terracota sai hoje; oliva é encomenda com data — a regra do painel. */
  tone: Tone;
}

/** Os pedidos que dão voltas no palco. Três bastam para não parecer loop. */
const LIVE = [
  {
    product: 'Bolo de ninho com morango',
    detail: 'Retirada · 16h',
    total: 142,
    tone: 'clay',
    stock: { name: 'Leite em pó', before: 2.4, after: 1.9 },
  },
  {
    product: 'Caixa com 12 brigadeiros',
    detail: 'Entrega · Centro',
    total: 54,
    tone: 'clay',
    stock: { name: 'Chocolate 50%', before: 3.1, after: 2.8 },
  },
  {
    product: 'Torta de limão, 20 fatias',
    detail: 'Encomenda · sábado',
    total: 168,
    tone: 'olive',
    stock: { name: 'Leite condensado', before: 4.2, after: 3.4 },
  },
] as const satisfies ReadonlyArray<Omit<Order, 'code'> & { stock: object }>;

/** Capacidade da prateleira, em kg — só para a barra ter onde encher. */
const STOCK_MAX = 5;

/** Cartões que já estavam no quadro quando a página abriu. */
const SEED_NEW: Order = {
  code: '#1839',
  product: 'Bolo de 2 andares',
  detail: 'Encomenda · domingo',
  total: 380,
  tone: 'olive',
};
const SEED_OVEN: Order = {
  code: '#1840',
  product: 'Caixa com 6 brownies',
  detail: 'Entrega · Vila Nova',
  total: 42,
  tone: 'clay',
};
const SEED_DONE: Order = {
  code: '#1838',
  product: 'Pão de mel, 10 un.',
  detail: 'Retirada · balcão',
  total: 45,
  tone: 'clay',
};

const MONTH_BASE = 18_240;
const ORDERS_BASE = 212;
const CYCLE_TOTAL = LIVE.reduce((sum, order) => sum + order.total, 0);

function liveOrder(round: number): Order & { stock: (typeof LIVE)[number]['stock'] } {
  const source = LIVE[round % LIVE.length]!;
  return { ...source, code: `#${1841 + round}` };
}

/** Soma dos pedidos já fechados, sem percorrer todas as voltas desde o início. */
function closedTotal(closed: number): number {
  const full = Math.floor(closed / LIVE.length);
  let total = full * CYCLE_TOTAL;
  for (let index = 0; index < closed % LIVE.length; index += 1) total += LIVE[index]!.total;
  return total;
}

const money = new Intl.NumberFormat('pt-BR');
const kilos = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1 });

/* -------------------------------------------------------------------------- */
/* Palco                                                                       */
/* -------------------------------------------------------------------------- */

export function HeroStage({ className }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);

  /* A preferência só vale depois da montagem. O servidor não a conhece e
     renderiza a primeira etapa; se o cliente lesse a preferência já no
     primeiro render, o quadro congelado (outra etapa, outro texto) divergiria
     do HTML e o React descartaria a hidratação. */
  const prefersReduced = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(Boolean(prefersReduced)), [prefersReduced]);

  /* Só roda enquanto alguém pode ver: fora da tela ou com a aba em segundo
     plano, o relógio para. Um loop que continua trocando estado sem plateia é
     bateria gasta no celular de quem abriu a página e foi atender o balcão. */
  const inView = useInView(stageRef, { amount: 0.35 });
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const [{ step, round }, setClock] = useState({ step: 0, round: 0 });
  const running = !reduced && inView && pageVisible;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setClock((current) =>
        current.step === LAST_STEP
          ? { step: 0, round: current.round + 1 }
          : { step: current.step + 1, round: current.round },
      );
    }, STEPS[step]!.ms);
    return () => window.clearTimeout(timer);
  }, [running, step, round]);

  /* Com movimento reduzido, o palco congela no meio da história — pedido no
     forno, insumo já baixado — que é o quadro que mais explica sozinho. */
  const shownStep = reduced ? 3 : step;
  const order = liveOrder(round);

  /* Onde o cartão da volta atual está. Tudo o mais deriva disto. */
  const liveStatus =
    shownStep === 0 ? null : shownStep === 1 ? 'new' : shownStep < LAST_STEP ? 'oven' : 'done';

  const newColumn = liveStatus === 'new' ? [order, SEED_NEW] : [SEED_NEW];
  const ovenColumn = liveStatus === 'oven' ? [order, SEED_OVEN] : [SEED_OVEN];
  /* "Pronto" guarda os dois mais recentes: o da volta atual (quando chega) e os
     das voltas anteriores, que continuam ali com a mesma chave — por isso não
     piscam quando a volta vira. */
  const doneColumn = [
    ...(liveStatus === 'done' ? [order] : []),
    ...(round >= 1 ? [liveOrder(round - 1)] : []),
    ...(round >= 2 ? [liveOrder(round - 2)] : [SEED_DONE]),
  ].slice(0, 2);

  const closed = round + (liveStatus === 'done' ? 1 : 0);
  const monthTotal = MONTH_BASE + closedTotal(closed);
  const stockLevel = shownStep >= 3 ? order.stock.after : order.stock.before;

  return (
    <div
      ref={stageRef}
      role="img"
      aria-label="Ilustração do sistema: um pedido feito na vitrine chega pelo WhatsApp, entra no quadro de produção, baixa o insumo do estoque e soma no faturamento do mês."
      className={cn(
        'relative isolate overflow-hidden rounded-panel bg-night p-3 shadow-float sm:p-5 lg:p-6',
        className,
      )}
    >
      {/* Trama de pontos: assadeira furada, não papel quadriculado. Dá textura
          ao marrom sem virar mais uma camada de cor. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(var(--color-sand-800)_1px,transparent_1.4px)] [background-size:16px_16px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-clay-500/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-64 w-64 rounded-full bg-honey-400/15 blur-3xl"
      />

      <Toast order={order} visible={shownStep === 1} />

      <div aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4 lg:grid-cols-[10.5rem_minmax(0,1fr)] lg:gap-5">
        <Phone order={order} step={shownStep} className="hidden sm:flex" />

        <LayoutGroup>
          <div className="overflow-hidden rounded-card border border-sand-700/40 bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-sand-100 px-3 py-2 sm:px-4 sm:py-2.5">
              <p className="text-[0.7rem] font-medium text-ink-soft sm:text-xs">Pedidos · sábado</p>
              <span className="flex items-center gap-1.5 text-[0.62rem] font-medium text-olive-700">
                <span className="relative flex h-1.5 w-1.5">
                  {reduced ? null : (
                    <span className="absolute inset-0 animate-ping rounded-full bg-olive-400" />
                  )}
                  <span className="relative h-1.5 w-1.5 rounded-full bg-olive-500" />
                </span>
                ao vivo
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1.5 sm:gap-2.5 sm:p-2.5 lg:gap-3 lg:p-3">
              <Column title="Novos" count={newColumn.length} highlight={shownStep === 1}>
                {newColumn.map((card) => (
                  <Card
                    key={card.code}
                    order={card}
                    fresh={card.code === order.code && !reduced}
                  />
                ))}
              </Column>

              <Column title="No forno" count={ovenColumn.length} highlight={shownStep === 2}>
                {ovenColumn.map((card) => (
                  <Card key={card.code} order={card} />
                ))}
              </Column>

              <Column title="Pronto" count={doneColumn.length} highlight={shownStep === LAST_STEP}>
                {/* Só aqui há saída: é a única coluna de onde um cartão some
                    de vez (o mais antigo, quando chega um novo). */}
                <AnimatePresence mode="popLayout" initial={false}>
                  {doneColumn.map((card) => (
                    <Card key={card.code} order={card} done exiting />
                  ))}
                </AnimatePresence>
              </Column>
            </div>
          </div>
        </LayoutGroup>
      </div>

      <div aria-hidden="true" className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:mt-5 lg:gap-5">
        <StockCard
          name={order.stock.name}
          level={stockLevel}
          highlight={shownStep === 3}
        />
        <MonthCard
          total={monthTotal}
          orders={ORDERS_BASE + closed}
          highlight={shownStep === LAST_STEP}
        />
      </div>

      <Trail step={shownStep} round={round} animate={running} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                       */
/* -------------------------------------------------------------------------- */

const ease = [0.22, 1, 0.36, 1] as const;

/** O celular da cliente. Só aparece a partir do `sm`: em 360px ele espremeria o
    quadro, e o quadro é o argumento — a vitrine todo concorrente já mostra. */
function Phone({ order, step, className }: { order: Order; step: number; className?: string }) {
  const sent = step >= 1;

  return (
    <div
      className={cn(
        'flex-col rounded-[1.4rem] border border-sand-700 bg-sand-800 p-1.5 lg:rounded-[1.6rem] lg:p-2',
        className,
      )}
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-[1.05rem] bg-canvas">
        <div className="flex justify-center pt-1.5">
          <span className="h-1 w-8 rounded-full bg-sand-300" />
        </div>
        <p className="truncate px-2.5 pt-1.5 text-[0.55rem] text-ink-muted">
          sualoja.appcantina.com.br
        </p>

        <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={order.code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease }}
              className="flex flex-1 flex-col"
            >
              {/* Um bloco de cor no lugar da foto do produto: sem ilustração de
                  bolo de banco de imagem, pela mesma regra das fotos da landing. */}
              <div
                className={cn(
                  'aspect-square w-full rounded-control',
                  order.tone === 'olive'
                    ? 'bg-gradient-to-br from-olive-100 via-honey-100 to-sand-200'
                    : 'bg-gradient-to-br from-berry-200 via-berry-100 to-honey-100',
                )}
              />
              <p className="mt-2 line-clamp-2 text-[0.66rem] font-medium leading-tight text-ink lg:mt-2.5 lg:text-[0.72rem]">
                {order.product}
              </p>
              <p className="mt-0.5 text-[0.62rem] text-ink-muted" data-numeric>
                R$ {money.format(order.total)},00
              </p>
            </m.div>
          </AnimatePresence>

          {/* O toque: o botão afunda e volta, e o rótulo vira confirmação. É o
              primeiro elo — sem ele, o pedido do quadro "aparece do nada". */}
          <m.div
            animate={step === 0 ? { scale: [1, 1, 0.93, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, times: [0, 0.55, 0.7, 0.85] }}
            className={cn(
              'mt-2 flex items-center justify-center gap-1 rounded-full py-1.5 text-[0.6rem] font-medium transition-colors duration-300',
              sent ? 'bg-olive-100 text-olive-700' : 'bg-primary text-ink-inverse',
            )}
          >
            {sent ? (
              <>
                <CheckIcon size={10} /> Pedido enviado
              </>
            ) : (
              'Enviar pedido'
            )}
          </m.div>
        </div>
      </div>
    </div>
  );
}

/** O aviso do WhatsApp. Cai por cima do quadro, que é onde o olho já está. */
function Toast({ order, visible }: { order: Order; visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-end sm:inset-x-5 sm:top-5 lg:inset-x-6 lg:top-6"
    >
      <AnimatePresence>
        {visible ? (
          <m.div
            key={order.code}
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="flex w-full max-w-[17.5rem] items-center gap-2.5 rounded-card border border-sand-200 bg-surface/95 p-2.5 shadow-float backdrop-blur-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-500 text-ink-inverse">
              <ChatIcon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.62rem] font-medium uppercase tracking-wide text-success-700">
                Novo pedido · WhatsApp
              </p>
              <p className="truncate text-xs font-medium text-ink">
                {order.code} · {order.product}
              </p>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Column({
  title,
  count,
  highlight,
  children,
}: {
  title: string;
  count: number;
  highlight: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        /* Altura fixa: cartões entrando e saindo não podem empurrar a página.
           E sem `overflow-hidden` — o cartão em trânsito passa por cima da
           divisa entre colunas, e cortá-lo ali quebraria a ilusão. */
        'flex h-[13rem] flex-col rounded-control bg-canvas p-1 transition-colors duration-500 sm:h-[14rem] sm:p-2 lg:h-[15.5rem] lg:p-2.5',
        highlight && 'bg-clay-50',
      )}
    >
      <div className="flex items-center justify-between px-0.5 pb-1.5 sm:pb-2">
        <p className="text-[0.6rem] font-medium text-ink-soft sm:text-[0.7rem]">{title}</p>
        <span className="rounded-full bg-sand-200 px-1.5 text-[0.55rem] font-medium text-ink-muted" data-numeric>
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 sm:gap-2">{children}</div>
    </div>
  );
}

/**
 * Um cartão do quadro.
 *
 * `layoutId` é o código do pedido: quando ele sai de uma coluna e nasce em
 * outra, o Motion liga os dois e o cartão ANDA em vez de sumir e reaparecer.
 * É isto que exige `domMax` no `LazyMotion` do hero.
 */
function Card({
  order,
  fresh = false,
  done = false,
  exiting = false,
}: {
  order: Order;
  fresh?: boolean;
  done?: boolean;
  exiting?: boolean;
}) {
  return (
    <m.div
      layout
      layoutId={order.code}
      /* Só o cartão que acabou de chegar entra do zero; nos outros, `initial`
         ligado faria o cartão piscar a cada troca de coluna. */
      initial={fresh ? { opacity: 0, scale: 0.85, y: -10 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={exiting ? { opacity: 0, scale: 0.9, transition: { duration: 0.25 } } : undefined}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className={cn(
        'rounded-[0.5rem] border border-l-2 border-border bg-surface px-1.5 py-1.5 shadow-soft sm:px-2.5 sm:py-2 lg:px-3 lg:py-2.5',
        order.tone === 'olive' ? 'border-l-olive-500' : 'border-l-clay-500',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-[0.55rem] font-medium text-ink-muted sm:text-[0.6rem]" data-numeric>
          {order.code}
        </p>
        {done ? (
          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-olive-100 text-olive-700">
            <CheckIcon size={8} />
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 line-clamp-2 text-[0.6rem] font-medium leading-tight text-ink sm:mt-1 sm:text-[0.7rem] lg:text-xs">
        {order.product}
      </p>
      <p className="mt-0.5 truncate text-[0.55rem] text-ink-muted sm:mt-1 sm:text-[0.6rem]">{order.detail}</p>
    </m.div>
  );
}

function StockCard({ name, level, highlight }: { name: string; level: number; highlight: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card border bg-surface p-2.5 transition-colors duration-500 sm:p-4',
        highlight ? 'border-honey-300' : 'border-sand-700/40',
      )}
    >
      <div className="flex items-center gap-1.5 text-[0.62rem] font-medium text-ink-muted">
        <StockIcon size={12} /> Estoque
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 sm:mt-2">
        <AnimatePresence mode="wait" initial={false}>
          <m.p
            key={name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="truncate text-xs font-medium text-ink sm:text-sm"
          >
            {name}
          </m.p>
        </AnimatePresence>
        <p className="shrink-0 text-xs font-medium text-ink sm:text-sm" data-numeric>
          {kilos.format(level)} kg
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-200 sm:mt-3 sm:h-2">
        {/* `scaleX`, não `width`: a barra encolhe no compositor, sem refazer
            layout a cada quadro. */}
        <m.div
          initial={false}
          animate={{ scaleX: level / STOCK_MAX }}
          transition={{ duration: 0.8, ease }}
          className="h-full origin-left rounded-full bg-honey-400"
        />
      </div>
      <p className="mt-1.5 truncate text-[0.58rem] text-ink-muted">baixa sozinha pela receita</p>
    </div>
  );
}

function MonthCard({ total, orders, highlight }: { total: number; orders: number; highlight: boolean }) {
  /* O número corre até o valor novo em vez de trocar seco: é o "somou" que o
     olho precisa ver para ligar o pedido pronto ao caixa. Valor de mola, não
     estado — contar de 18.240 a 18.382 não pode custar 140 renders. */
  const spring = useSpring(total, { stiffness: 70, damping: 20 });
  const shown = useTransform(spring, (value) => money.format(Math.round(value)));

  useEffect(() => {
    spring.set(total);
  }, [spring, total]);

  return (
    <div
      className={cn(
        'rounded-card border p-2.5 transition-colors duration-500 sm:p-4',
        highlight ? 'border-honey-300 bg-honey-50' : 'border-sand-700/40 bg-surface',
      )}
    >
      <div className="flex items-center gap-1.5 text-[0.62rem] font-medium text-ink-muted">
        <FinanceIcon size={12} /> Setembro até agora
      </div>
      <p className="mt-1 font-display text-lg leading-tight text-ink sm:mt-1.5 sm:text-2xl" data-numeric>
        R$ <m.span>{shown}</m.span>
      </p>
      <p className="mt-1 truncate text-[0.58rem] text-ink-muted" data-numeric>
        {orders} pedidos · custo já descontado
      </p>
    </div>
  );
}

/**
 * A trilha: a frase do título, em cinco paradas.
 *
 * A barra da etapa atual enche no tempo exato da etapa, então ela também
 * funciona como relógio — quem olha sabe que a cena vai mudar e espera por
 * ela, em vez de achar que o movimento é aleatório.
 */
function Trail({ step, round, animate }: { step: number; round: number; animate: boolean }) {
  return (
    <ol aria-hidden="true" className="mt-4 grid grid-cols-5 gap-1.5 px-0.5 sm:mt-5 sm:gap-3 lg:mt-6">
      {STEPS.map((entry, index) => {
        const past = index < step;
        const current = index === step;

        return (
          <li key={entry.label} className="min-w-0">
            <div className="h-1 overflow-hidden rounded-full bg-sand-800">
              {current ? (
                <m.div
                  key={`${round}-${index}`}
                  initial={animate ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: entry.ms / 1000, ease: 'linear' }}
                  className="h-full origin-left rounded-full bg-clay-400"
                />
              ) : (
                <div className={cn('h-full rounded-full', past ? 'bg-clay-600' : 'bg-transparent')} />
              )}
            </div>
            <p
              className={cn(
                'mt-1.5 truncate text-[0.58rem] font-medium transition-colors duration-300 sm:mt-2 sm:text-[0.7rem]',
                current ? 'text-sand-50' : past ? 'text-sand-400' : 'text-sand-600',
              )}
            >
              {entry.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
