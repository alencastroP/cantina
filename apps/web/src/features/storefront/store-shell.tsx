'use client';

import type { DeliveryZonePublic, StorefrontConfig } from '@cantina/contracts';
import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import {
  BasketIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  ScooterIcon,
  StoreIcon,
} from '../../components/layout/icons';
import { Wordmark } from '../../components/landing/wordmark';
import { cn } from '../../lib/cn';
import { formatCents, formatPhone } from '../../lib/format';
import { AccountButton, GLASS_PILL } from './account-panel';
import { useCart } from './cart';
import { CartBar } from './cart-bar';
import { WEEKDAY_NAMES } from './hours';
import { Sheet, SheetHeader } from './sheet';
import { modeOf, useStorePaths, type StoreMode } from './store-paths';

/**
 * Casca da vitrine.
 *
 * O coração dela é a pergunta que o cliente precisa responder antes de
 * qualquer outra: **é para agora ou para outro dia?** Delivery e encomenda
 * são dois fluxos com carrinho, cozinha e kanban próprios (D6), e a tela diz
 * isso em três camadas ao mesmo tempo — cor (terracota × oliva), palavra
 * ("Pedir agora" × "Encomendar") e roteiro (três passos de cada um).
 *
 * A casca vive no layout e não remonta entre `/` e `/encomenda`: por isso o
 * polegar dos cartões DESLIZA de um modo para o outro em vez de piscar. Ele
 * se move no toque, antes de a próxima página chegar do servidor.
 *
 * Na sacola e no acompanhamento a capa some: ali a tela tem uma tarefa só,
 * e o cabeçalho encolhe para "voltar" e o nome da loja.
 */

type IconType = ComponentType<{ size?: number; className?: string }>;

const MODES: Record<
  StoreMode,
  { label: string; short: string; caption: string; icon: IconType; path: string }
> = {
  now: { label: 'Pedir agora', short: 'Agora', caption: 'Fica pronto hoje', icon: ScooterIcon, path: '/' },
  later: {
    label: 'Encomendar',
    short: 'Encomenda',
    caption: 'Você escolhe o dia',
    icon: CalendarIcon,
    path: '/encomenda',
  },
};

function formatAddress(address: Record<string, string> | null): string | null {
  if (!address) return null;
  const parts = [
    [address.street, address.number].filter(Boolean).join(', '),
    address.neighborhood,
    address.city,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function deliverySummary(zones: DeliveryZonePublic[]) {
  if (zones.length === 0) return null;
  const etas = zones
    .map((zone) => zone.etaMinutes)
    .filter((eta): eta is number => eta !== null);
  const low = Math.min(...etas);
  const high = Math.max(...etas);

  return {
    minFeeCents: Math.min(...zones.map((zone) => zone.feeCents)),
    eta: etas.length === 0 ? null : low === high ? `${low}` : `${low}–${high}`,
  };
}

export function StoreShell({
  host,
  config,
  zones,
  openingHint,
  today,
  children,
}: {
  host: string;
  config: StorefrontConfig;
  zones: DeliveryZonePublic[];
  openingHint: string | null;
  today: number;
  children: ReactNode;
}) {
  const { href, route } = useStorePaths(host);
  const cart = useCart();
  const routeMode = modeOf(route);
  const focused = route.startsWith('/sacola') || route.startsWith('/pedido');

  // O polegar anda no toque; a rota confirma quando a página nova chega.
  const [optimistic, setOptimistic] = useState<StoreMode | null>(null);
  useEffect(() => setOptimistic(null), [route]);
  const mode = optimistic ?? routeMode;

  // Barra compacta: aparece quando os cartões de modo saem da tela por cima.
  const switchRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const element = switchRef.current;
    if (!element) {
      setStuck(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [focused]);

  const [infoOpen, setInfoOpen] = useState(false);
  const bagCount = cart.ready ? cart.count : 0;

  return (
    <div data-mode={routeMode} className="flex min-h-dvh flex-col">
      {focused ? (
        <FocusHeader
          title={route.startsWith('/sacola') ? 'Sua sacola' : 'Acompanhar'}
          config={config}
          backHref={href('/')}
        />
      ) : (
        <>
          <StoreHero
            config={config}
            host={host}
            openingHint={openingHint}
            onInfo={() => setInfoOpen(true)}
          />

          <div ref={switchRef} className="mx-auto w-full max-w-2xl px-4 pt-5">
            {config.acceptsPreorder ? (
              <ModeCards mode={mode} href={href} onPick={setOptimistic} bagCount={bagCount} />
            ) : null}
            <ModeDefinition mode={mode} config={config} zones={zones} openingHint={openingHint} />
          </div>

          <CompactBar
            visible={stuck}
            config={config}
            mode={mode}
            href={href}
            onPick={setOptimistic}
          />
        </>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-7">{children}</main>

      <footer className="mx-auto w-full max-w-2xl px-4 pb-8 text-center text-xs text-ink-muted">
        Feito com <Wordmark size="sm" className="inline-flex align-middle" />
      </footer>

      <CartBar host={host} minOrderCents={config.minOrderCents} />

      <StoreInfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        config={config}
        zones={zones}
        today={today}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Capa                                                                        */
/* -------------------------------------------------------------------------- */

function StoreLogo({ config, className }: { config: StorefrontConfig; className?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden bg-surface', className)}>
      {config.theme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.theme.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center bg-clay-100 font-display text-[1.4em] text-clay-600">
          {config.name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function OpenStatus({ isOpen, hint }: { isOpen: boolean; hint: string | null }) {
  return (
    <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-sand-900/45 px-2.5 py-1 text-xs font-medium text-sand-100 backdrop-blur">
      <span className="relative flex size-2 shrink-0">
        {isOpen ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-success-500 opacity-75" />
        ) : null}
        <span className={cn('relative size-2 rounded-full', isOpen ? 'bg-success-500' : 'bg-sand-400')} />
      </span>
      <span className="truncate">
        {isOpen ? 'Aberto agora' : 'Fechado'}
        {hint ? <span className="text-sand-100/75"> · {hint}</span> : null}
      </span>
    </p>
  );
}

function StoreHero({
  config,
  host,
  openingHint,
  onInfo,
}: {
  config: StorefrontConfig;
  host: string;
  openingHint: string | null;
  onInfo: () => void;
}) {
  return (
    <header className="px-3 pt-3">
      <div className="relative mx-auto h-56 max-w-2xl overflow-hidden rounded-[1.75rem] bg-linear-135 from-clay-300 via-sand-300 to-olive-300 shadow-raised sm:h-64">
        {config.theme.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.theme.coverUrl}
            alt=""
            className="absolute inset-0 size-full animate-cover object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-40 [background-image:radial-gradient(var(--color-sand-50)_1.2px,transparent_1.6px)] [background-size:14px_14px]"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-sand-900/90 via-sand-900/30 to-sand-900/15"
        />

        <button type="button" onClick={onInfo} className={cn(GLASS_PILL, 'absolute left-3 top-3')}>
          <ClockIcon size={17} />
          Horários
        </button>
        <div className="absolute right-3 top-3">
          <AccountButton host={host} />
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3.5 p-4">
          <StoreLogo
            config={config}
            className="size-16 rounded-[1.1rem] text-2xl shadow-raised ring-2 ring-sand-50/80"
          />
          <div className="min-w-0 flex-1 animate-rise">
            <h1 className="text-[1.85rem] leading-[1.05] text-ink-inverse [text-wrap:balance]">
              {config.name}
            </h1>
            <OpenStatus isOpen={config.isOpenNow} hint={openingHint} />
          </div>
        </div>
      </div>

      {config.about ? (
        <p className="mx-auto mt-3 max-w-2xl px-2 text-sm leading-relaxed text-ink-soft">
          {config.about}
        </p>
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Os dois modos                                                               */
/* -------------------------------------------------------------------------- */

function ModeCards({
  mode,
  href,
  onPick,
  bagCount,
}: {
  mode: StoreMode;
  href: (path: string) => string;
  onPick: (mode: StoreMode) => void;
  bagCount: number;
}) {
  return (
    <nav
      aria-label="Como você quer comprar"
      data-mode={mode}
      className="relative grid grid-cols-2 gap-2 rounded-[1.75rem] bg-sand-200/80 p-1.5"
    >
      {/* O polegar: um bloco só, que desliza e troca de cor com mola. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1.5 left-1.5 w-[calc(50%-0.625rem)] rounded-[1.35rem] bg-mode shadow-[0_12px_28px_-12px_var(--color-mode)] transition-[translate,background-color] duration-500 ease-[var(--ease-spring)]"
        style={{ translate: mode === 'later' ? 'calc(100% + 0.5rem) 0' : '0 0' }}
      />

      {(['now', 'later'] as const).map((key) => {
        const item = MODES[key];
        const Icon = item.icon;
        const active = key === mode;

        return (
          <Link
            key={key}
            href={href(item.path)}
            data-mode={key}
            aria-current={active ? 'page' : undefined}
            onClick={() => onPick(key)}
            className={cn(
              'relative z-10 flex flex-col gap-3 rounded-[1.35rem] px-3.5 pb-3 pt-3 transition-colors duration-300',
              active ? 'text-ink-inverse' : 'text-ink-soft hover:text-ink',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'grid size-10 place-items-center rounded-full transition-colors duration-300',
                  active ? 'bg-ink-inverse/20 text-ink-inverse' : 'bg-surface text-mode',
                )}
              >
                <Icon size={21} />
              </span>
              {key === 'now' && bagCount > 0 ? (
                <span
                  key={bagCount}
                  className={cn(
                    'animate-pop rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    active ? 'bg-ink-inverse/20' : 'bg-mode text-ink-inverse',
                  )}
                >
                  <span data-numeric>{bagCount}</span> na sacola
                </span>
              ) : null}
            </span>
            <span className="leading-tight">
              <span className="block font-display text-[1.15rem]">{item.label}</span>
              <span
                className={cn(
                  'mt-0.5 block text-xs transition-colors duration-300',
                  active ? 'text-ink-inverse/80' : 'text-ink-muted',
                )}
              >
                {item.caption}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

interface ModeCopy {
  title: string;
  lead: string;
  steps: Array<{ icon: IconType; label: string; detail?: string | undefined }>;
  facts: Array<{ text: string; tone?: 'warning' }>;
}

function nowCopy(
  config: StorefrontConfig,
  zones: DeliveryZonePublic[],
  openingHint: string | null,
): ModeCopy {
  const delivery = config.acceptsDelivery ? deliverySummary(zones) : null;
  const both = config.acceptsDelivery && config.acceptsPickup;
  const how = both
    ? 'receba em casa ou retire no balcão'
    : config.acceptsDelivery
      ? 'receba em casa'
      : 'retire no balcão';

  const facts: ModeCopy['facts'] = [];
  if (!config.isOpenNow) {
    facts.push({
      text: `Fechado agora${openingHint ? `, ${openingHint}` : ''} — dá para deixar o pedido`,
      tone: 'warning',
    });
  }
  if (delivery) facts.push({ text: `Entrega a partir de ${formatCents(delivery.minFeeCents)}` });
  if (config.acceptsPickup) facts.push({ text: 'Retirada sem taxa' });
  if (config.minOrderCents > 0) {
    facts.push({ text: `Pedido mínimo ${formatCents(config.minOrderCents)}` });
  }

  return {
    title: 'Para hoje.',
    lead: `Escolha no cardápio do dia e ${how}.`,
    steps: [
      { icon: BasketIcon, label: 'Monte a sacola' },
      {
        icon: config.acceptsDelivery ? ScooterIcon : StoreIcon,
        label: both ? 'Entrega ou retirada' : config.acceptsDelivery ? 'Entregamos' : 'Retire no balcão',
      },
      {
        icon: ClockIcon,
        label: config.acceptsDelivery ? 'Chega hoje' : 'Pronto hoje',
        detail: delivery?.eta ? `~${delivery.eta} min` : undefined,
      },
    ],
    facts,
  };
}

const LATER_COPY: ModeCopy = {
  title: 'Para um dia marcado.',
  lead:
    'Encomende com antecedência para festas, datas especiais ou quantidades maiores. A loja prepara para o dia que você escolher.',
  steps: [
    { icon: CalendarIcon, label: 'Escolha o dia' },
    { icon: BasketIcon, label: 'Monte a encomenda' },
    { icon: StoreIcon, label: 'Retire na loja' },
  ],
  facts: [
    { text: 'Vagas limitadas por dia' },
    { text: 'A loja confirma por telefone' },
    { text: 'Pagamento combinado' },
  ],
};

/**
 * O que é cada modo, em uma frase e três passos.
 *
 * Mesma estrutura nos dois, conteúdo diferente — é a comparação lado a lado
 * que ensina a diferença, sem um parágrafo explicando "delivery vs.
 * encomenda". Troca com um deslize na direção do cartão tocado.
 */
function ModeDefinition({
  mode,
  config,
  zones,
  openingHint,
}: {
  mode: StoreMode;
  config: StorefrontConfig;
  zones: DeliveryZonePublic[];
  openingHint: string | null;
}) {
  const copy = mode === 'now' ? nowCopy(config, zones, openingHint) : LATER_COPY;

  return (
    <div className="mt-3">
      <div
        key={mode}
        data-mode={mode}
        className={cn(
          'rounded-[1.5rem] bg-mode-soft px-4 pb-4 pt-3.5 ring-1 ring-inset ring-mode/15',
          mode === 'now' ? 'animate-enter-left' : 'animate-enter-right',
        )}
      >
        <p className="text-[0.95rem] leading-snug text-ink-soft">
          <strong className="font-display text-[1.05rem] font-semibold text-mode-ink">
            {copy.title}
          </strong>{' '}
          {copy.lead}
        </p>

        <ol className="relative mt-4 grid grid-cols-3 gap-1 before:absolute before:left-[16.6%] before:right-[16.6%] before:top-[1.125rem] before:border-t-[1.5px] before:border-dashed before:border-mode/35">
          {copy.steps.map((step, index) => (
            <li
              key={step.label}
              className="relative flex animate-rise flex-col items-center gap-1.5 text-center"
              style={{ animationDelay: `${120 + index * 90}ms` }}
            >
              <span className="grid size-9 place-items-center rounded-full bg-surface text-mode-ink shadow-soft ring-1 ring-mode/20">
                <step.icon size={18} />
              </span>
              <span className="text-xs font-medium leading-tight text-ink">{step.label}</span>
              {step.detail ? (
                <span className="-mt-1 text-[0.7rem] leading-tight text-ink-muted">{step.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>

        {copy.facts.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {copy.facts.map((fact) => (
              <li
                key={fact.text}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs',
                  fact.tone === 'warning'
                    ? 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-500/25'
                    : 'bg-surface/80 text-ink-soft ring-1 ring-inset ring-border',
                )}
              >
                {fact.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Barras                                                                      */
/* -------------------------------------------------------------------------- */

function MiniToggle({
  mode,
  href,
  onPick,
}: {
  mode: StoreMode;
  href: (path: string) => string;
  onPick: (mode: StoreMode) => void;
}) {
  return (
    <nav
      aria-label="Como você quer comprar"
      data-mode={mode}
      className="relative grid shrink-0 grid-cols-2 rounded-full bg-sand-200 p-1 text-xs font-semibold"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-mode shadow-soft transition-[translate,background-color] duration-500 ease-[var(--ease-spring)]"
        style={{ translate: mode === 'later' ? '100% 0' : '0 0' }}
      />
      {(['now', 'later'] as const).map((key) => (
        <Link
          key={key}
          href={href(MODES[key].path)}
          aria-current={key === mode ? 'page' : undefined}
          onClick={() => onPick(key)}
          className={cn(
            'relative z-10 px-3 py-1.5 text-center transition-colors duration-300',
            key === mode ? 'text-ink-inverse' : 'text-ink-soft',
          )}
        >
          {MODES[key].short}
        </Link>
      ))}
    </nav>
  );
}

/** Nome da loja e o seletor de modo, sempre ao alcance depois que a capa sai. */
function CompactBar({
  visible,
  config,
  mode,
  href,
  onPick,
}: {
  visible: boolean;
  config: StorefrontConfig;
  mode: StoreMode;
  href: (path: string) => string;
  onPick: (mode: StoreMode) => void;
}) {
  return (
    <div
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-canvas/85 backdrop-blur-md transition-[translate,opacity] duration-300 ease-[var(--ease-out-soft)]',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
      )}
    >
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
        <StoreLogo config={config} className="size-8 rounded-[0.6rem] text-sm" />
        <span className="min-w-0 flex-1 truncate font-display text-[1.05rem] text-ink">
          {config.name}
        </span>
        {config.acceptsPreorder ? <MiniToggle mode={mode} href={href} onPick={onPick} /> : null}
      </div>
    </div>
  );
}

function FocusHeader({
  title,
  config,
  backHref,
}: {
  title: string;
  config: StorefrontConfig;
  backHref: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-2">
        <Link
          href={backHref}
          aria-label="Voltar ao cardápio"
          className="grid size-10 place-items-center rounded-full text-ink-soft transition-[background-color,transform] hover:bg-sand-200 active:scale-90"
        >
          <ChevronLeftIcon size={22} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[1.1rem] text-ink">{title}</p>
          <p className="truncate text-xs text-ink-muted">{config.name}</p>
        </div>
        <StoreLogo config={config} className="mr-2 size-8 rounded-[0.6rem] text-sm" />
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Horários, endereço e bairros                                                */
/* -------------------------------------------------------------------------- */

const EYEBROW = 'mb-2.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted';

function StoreInfoSheet({
  open,
  onClose,
  config,
  zones,
  today,
}: {
  open: boolean;
  onClose: () => void;
  config: StorefrontConfig;
  zones: DeliveryZonePublic[];
  today: number;
}) {
  const titleId = useId();
  const address = formatAddress(config.address);
  // A semana começa na segunda, como a da loja.
  const week = [1, 2, 3, 4, 5, 6, 0];

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <SheetHeader
        id={titleId}
        title={config.name}
        description={config.isOpenNow ? 'Aberto agora' : 'Fechado agora'}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        {address ? (
          <section>
            <h3 className={EYEBROW}>Endereço</h3>
            <p className="flex items-start gap-2.5 text-sm text-ink-soft">
              <MapPinIcon size={18} className="mt-0.5 shrink-0 text-ink-muted" />
              {address}
            </p>
          </section>
        ) : null}

        {config.hours.length > 0 ? (
          <section>
            <h3 className={EYEBROW}>Horários</h3>
            <ul className="divide-y divide-dashed divide-border rounded-2xl bg-sand-100 px-4">
              {week.map((day) => {
                const slots = config.hours.filter((hour) => hour.weekday === day);
                const isToday = day === today;
                return (
                  <li
                    key={day}
                    className={cn(
                      'flex items-center justify-between gap-3 py-2.5 text-sm',
                      isToday ? 'font-semibold text-ink' : 'text-ink-soft',
                    )}
                  >
                    <span className="capitalize">
                      {WEEKDAY_NAMES[day]}
                      {isToday ? (
                        <span className="ml-2 rounded-full bg-mode-tint px-2 py-0.5 text-[11px] normal-case text-mode-ink">
                          hoje
                        </span>
                      ) : null}
                    </span>
                    <span data-numeric className={slots.length === 0 ? 'text-ink-muted' : undefined}>
                      {slots.length > 0
                        ? slots.map((slot) => `${slot.opensAt}–${slot.closesAt}`).join(' · ')
                        : 'fechado'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {config.acceptsDelivery && zones.length > 0 ? (
          <section>
            <h3 className={EYEBROW}>Onde entregamos</h3>
            <ul className="space-y-2">
              {zones.map((zone) => (
                <li
                  key={zone.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-sand-100 px-4 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-2 text-ink">
                    <ScooterIcon size={17} className="text-ink-muted" />
                    {zone.neighborhood ?? zone.name}
                  </span>
                  <span className="text-ink-muted" data-numeric>
                    {formatCents(zone.feeCents)}
                    {zone.etaMinutes ? ` · ~${zone.etaMinutes} min` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {config.contactPhone ? (
          <a
            href={`tel:${config.contactPhone}`}
            className="flex items-center gap-2.5 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-ink-soft transition-colors hover:bg-sand-200"
          >
            <PhoneIcon size={18} />
            {formatPhone(config.contactPhone)}
          </a>
        ) : null}
      </div>
    </Sheet>
  );
}
