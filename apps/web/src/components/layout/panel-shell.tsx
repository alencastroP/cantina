'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { useSession } from '../auth-provider';
import { Wordmark } from '../landing/wordmark';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import { CloseIcon, LogoutIcon, MenuIcon } from './icons';
import { isActive, PRIMARY_NAV, visibleSections, type NavItem } from './navigation';

/**
 * Casca do painel.
 *
 * Duas navegações, não uma redimensionada: no desktop, uma barra lateral com
 * a estrutura inteira; no celular, quatro atalhos na base — que é onde o
 * polegar chega quando o lojista está com a outra mão ocupada.
 *
 * O menu completo continua acessível no celular pelo botão do cabeçalho.
 */

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;

  if (item.status === 'soon') {
    return (
      <span
        className="flex items-center gap-3 rounded-control px-3 py-2 text-sm text-ink-muted/70"
        title="Em breve"
      >
        <Icon size={18} />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-sand-200 px-2 py-0.5 text-[0.6875rem] text-ink-muted">
          em breve
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-clay-100 font-medium text-clay-700'
          : 'text-ink-soft hover:bg-sand-200 hover:text-ink',
      )}
    >
      <Icon size={18} />
      {item.label}
    </Link>
  );
}

function NavTree({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { user } = useSession();

  return (
    <nav className="space-y-6">
      {visibleSections(user?.role).map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                {...(onNavigate ? { onNavigate } : {})}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function PanelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, tenant, logout } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* --- Barra lateral: só no desktop --- */}
      <aside className="hidden border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="border-b border-border px-5 py-5">
          <Link href="/painel" className="inline-flex rounded-control" aria-label="Cantina — início do painel">
            <Wordmark size="lg" />
          </Link>
          <p className="mt-1.5 truncate text-sm text-ink-muted">{tenant?.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavTree pathname={pathname} />
        </div>

        <div className="border-t border-border p-3">
          <div className="px-3 pb-2">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-ink-muted">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            icon={<LogoutIcon size={16} />}
            onClick={() => void logout()}
            className="justify-start"
          >
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* --- Cabeçalho: só no celular --- */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
          <div className="min-w-0">
            <Link href="/painel" className="inline-flex rounded-control" aria-label="Cantina — início do painel">
              <Wordmark size="md" />
            </Link>
            <p className="truncate text-xs text-ink-muted">{tenant?.name}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <MenuIcon />
          </Button>
        </header>

        {/* `pb-20` no celular abre espaço para a barra inferior não cobrir o
            último item da lista. */}
        <main className="flex-1 px-4 pb-24 pt-5 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      {/* --- Barra inferior: só no celular --- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
        aria-label="Atalhos"
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          const disabled = item.status === 'soon';

          const content = (
            <>
              <Icon size={20} />
              <span className="text-[0.6875rem]">{item.label}</span>
            </>
          );

          const className = cn(
            'flex flex-col items-center gap-1 py-2.5 transition-colors',
            disabled ? 'text-ink-muted/50' : active ? 'text-clay-600' : 'text-ink-muted',
          );

          return disabled ? (
            <span key={item.href} className={className} aria-disabled="true">
              {content}
            </span>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={className}
              aria-current={active ? 'page' : undefined}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      {/* --- Menu completo no celular --- */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-sand-900/30"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-surface shadow-raised">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-medium text-ink">Menu</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
              >
                <CloseIcon />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavTree pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>

            <div className="border-t border-border p-3">
              <p className="px-3 pb-2 text-sm text-ink-muted">{user?.email}</p>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                icon={<LogoutIcon size={16} />}
                onClick={() => void logout()}
                className="justify-start"
              >
                Sair
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
