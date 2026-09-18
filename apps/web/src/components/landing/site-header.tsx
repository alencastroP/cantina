'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import {
  CalendarIcon,
  CustomersIcon,
  CloseIcon,
  FinanceIcon,
  MenuIcon,
  StockIcon,
  StoreIcon,
} from '../layout/icons';
import { cn } from '../../lib/cn';
import { Wordmark } from './wordmark';
import { trialLabel } from './config';

/**
 * Cabeçalho fixo da landing.
 *
 * Duas ações, e a hierarquia entre elas é deliberada: "Acessar" é link de
 * texto (quem já é cliente procura o login, não precisa de ajuda para achá-lo)
 * e "Teste grátis" é a pílula terracota — a única cor forte do cabeçalho, pela
 * mesma regra do resto do sistema: terracota marca UMA ação por tela.
 *
 * Os menus abrem no CLIQUE, não no passar do mouse. Menu que abre sozinho é
 * intocável por teclado, dispara sem querer em telas híbridas, e no celular
 * simplesmente não existe — aqui o mesmo componente serve os dois casos.
 *
 * Nada neste componente conhece sessão. Ele não importa `lib/api`, não lê
 * cookie e não descobre se há alguém logado: a landing é pública e não deve
 * disparar nenhuma chamada autenticada só por ter sido aberta.
 */

interface NavItem {
  label: string;
  description: string;
  href: string;
  icon: typeof StoreIcon;
}

const PRODUTO: NavItem[] = [
  {
    label: 'Vitrine e pedidos',
    description: 'Cardápio online, pedido direto no WhatsApp',
    href: '#vender',
    icon: StoreIcon,
  },
  {
    label: 'Encomendas',
    description: 'Calendário com os dias que você ainda consegue fazer',
    href: '#encomendar',
    icon: CalendarIcon,
  },
  {
    label: 'Estoque',
    description: 'Insumo e embalagem, com aviso antes de acabar',
    href: '#estoque',
    icon: StockIcon,
  },
  {
    label: 'Custo e financeiro',
    description: 'Quanto cada doce custa e quanto sobrou no mês',
    href: '#financeiro',
    icon: FinanceIcon,
  },
];

const PARA_QUEM: NavItem[] = [
  {
    label: 'Doceria com balcão',
    description: 'Vende no dia, entrega no bairro',
    href: '#comparativo',
    icon: StoreIcon,
  },
  {
    label: 'Bolos sob encomenda',
    description: 'Agenda cheia, tudo com data marcada',
    href: '#encomendar',
    icon: CalendarIcon,
  },
  {
    label: 'Confeitaria em casa',
    description: 'Começando, sem equipe e sem sistema',
    href: '#comecar',
    icon: CustomersIcon,
  },
];

export function SiteHeader() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Esc fecha o que estiver aberto, e clique fora fecha o dropdown. Sem os
  // dois, o menu fica preso na tela quando a pessoa desiste dele.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenMenu(null);
      setMobileOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (navRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/80 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:gap-6">
        <Link
          href="/"
          className="shrink-0 rounded-control"
          aria-label="Cantina — início"
        >
          <Wordmark />
        </Link>

        <nav ref={navRef} className="hidden lg:flex lg:items-center lg:gap-1" aria-label="Principal">
          <Dropdown
            label="Produto"
            items={PRODUTO}
            open={openMenu === 'produto'}
            onToggle={() => setOpenMenu((current) => (current === 'produto' ? null : 'produto'))}
            onNavigate={() => setOpenMenu(null)}
          />
          <Dropdown
            label="Para quem"
            items={PARA_QUEM}
            open={openMenu === 'para-quem'}
            onToggle={() =>
              setOpenMenu((current) => (current === 'para-quem' ? null : 'para-quem'))
            }
            onNavigate={() => setOpenMenu(null)}
          />
          <NavLink href="#comecar">Como começar</NavLink>
          <NavLink href="#duvidas">Dúvidas</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/entrar"
            className="hidden rounded-control px-3 py-2 text-sm font-medium text-ink-soft transition-colors duration-200 hover:text-ink sm:block"
          >
            Acessar
          </Link>

          <Link
            href="/teste-gratis"
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-ink-inverse shadow-soft transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-primary-hover hover:shadow-raised active:scale-[0.97] sm:px-5"
          >
            Teste grátis
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="menu-mobile"
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-control text-ink-soft transition-colors duration-200 hover:bg-sand-200/70 hover:text-ink lg:hidden"
          >
            {mobileOpen ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
            <span className="sr-only">{mobileOpen ? 'Fechar menu' : 'Abrir menu'}</span>
          </button>
        </div>
      </div>

      {/* Menu do celular: uma lista só, sem submenu — dois níveis num painel
          de 360px viram um labirinto. */}
      <div
        id="menu-mobile"
        inert={!mobileOpen}
        className={cn(
          'reveal border-t border-sand-200 bg-canvas lg:hidden',
          mobileOpen && 'shadow-soft',
        )}
        data-open={mobileOpen}
      >
        <div>
          <nav className="space-y-1 px-4 py-4" aria-label="Principal (celular)">
            {PRODUTO.map((item) => (
              <a
                key={item.href + item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-start gap-3 rounded-card px-2 py-2.5 hover:bg-sand-200/60"
              >
                <item.icon size={18} className="mt-0.5 shrink-0 text-clay-500" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{item.label}</span>
                  <span className="block text-xs leading-snug text-ink-muted">
                    {item.description}
                  </span>
                </span>
              </a>
            ))}

            {[
              { href: '#comecar', label: 'Como começar' },
              { href: '#duvidas', label: 'Dúvidas' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-card px-2 py-2.5 text-sm font-medium text-ink hover:bg-sand-200/60"
              >
                {link.label}
              </a>
            ))}

            <div className="flex items-center gap-3 border-t border-sand-200 pt-3">
              <Link
                href="/entrar"
                className="flex h-11 flex-1 items-center justify-center rounded-control border border-border bg-surface text-sm font-medium text-ink"
              >
                Acessar
              </Link>
              <Link
                href="/teste-gratis"
                className="flex h-11 flex-1 items-center justify-center rounded-control bg-primary text-sm font-medium text-ink-inverse"
              >
                {trialLabel()}
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

/**
 * Item de menu com sublinhado que cresce do centro.
 *
 * O traço é um `::after` com `scale-x`, e não `border-bottom` aparecendo: borda
 * que surge empurra o texto meio pixel para cima no quadro em que aparece, e
 * numa fileira de quatro links isso é visível como um tremor.
 */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="relative rounded-control px-3 py-2 text-sm font-medium text-ink-soft transition-colors duration-200 hover:text-ink after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-center after:scale-x-0 after:bg-clay-400 after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100"
    >
      {children}
    </a>
  );
}

function Dropdown({
  label,
  items,
  open,
  onToggle,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const id = useId();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        {label}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={cn('transition-transform duration-200', open && 'rotate-180')}
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          id={id}
          className="absolute left-0 top-full z-10 mt-2 w-80 animate-rise rounded-panel border border-border bg-surface p-2 shadow-raised"
        >
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className="flex items-start gap-3 rounded-card px-3 py-2.5 transition-colors hover:bg-sand-100"
            >
              <item.icon size={18} className="mt-0.5 shrink-0 text-clay-500" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{item.label}</span>
                <span className="block text-xs leading-snug text-ink-muted">
                  {item.description}
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
