import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Spinner } from './feedback';

/**
 * Botão.
 *
 * Terracota é escassa por decisão de paleta: `primary` marca UMA ação por
 * tela. O resto é `secondary` ou `ghost` — se dois botões disputam atenção,
 * nenhum a recebe.
 *
 * `LinkButton` existe em vez de um `as` polimórfico: a tipagem de um
 * componente que aceita tanto `href` quanto `onClick` fica pior de ler do que
 * dois componentes que compartilham as mesmas classes. E a distinção importa —
 * navegação é link, ação é botão, e leitor de tela anuncia diferente.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-ink-inverse shadow-soft hover:bg-primary-hover active:bg-clay-700 disabled:bg-sand-400',
  secondary:
    'bg-surface text-ink border border-border hover:border-border-strong hover:bg-sand-100 active:bg-sand-200',
  ghost: 'text-ink-soft hover:bg-sand-200 hover:text-ink active:bg-sand-300',
  danger:
    'bg-danger-500 text-ink-inverse shadow-soft hover:bg-danger-700 active:bg-danger-700',
};

const SIZES: Record<Size, string> = {
  // 36-48px de altura: o mínimo confortável para o dedo no balcão.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

/**
 * O afundar no clique é para o dedo, não para o olho.
 *
 * No balcão, com o celular numa mão só, o toque acontece antes de a tela
 * responder — e sem um sinal imediato a pessoa toca de novo. `active:scale`
 * responde no mesmo quadro do `pointerdown`, antes de qualquer requisição
 * sair. O `disabled:` anula: botão desabilitado que afunda promete que
 * aconteceu alguma coisa.
 */
const BASE =
  'inline-flex items-center justify-center rounded-control font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:active:scale-100';

function styles(variant: Variant, size: Size, fullWidth: boolean, className?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Ícone antes do texto. Decorativo — o rótulo carrega o significado. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // Desabilitar durante o envio evita o clique duplo que vira dois pedidos.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        styles(variant, size, fullWidth, className),
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : icon}
      {children}
    </button>
  );
}

export interface LinkButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth = false,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link href={href} className={styles(variant, size, fullWidth, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
