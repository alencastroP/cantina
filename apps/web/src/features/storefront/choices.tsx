'use client';

import type { PaymentMethod } from '@cantina/contracts';
import type { ReactNode } from 'react';

import { CheckIcon } from '../../components/layout/icons';
import { Spinner } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';

/** `['o nome', 'a rua', 'o bairro']` vira "o nome, a rua e o bairro". */
export function joinList(items: string[]): string {
  return items.join(', ').replace(/, ([^,]*)$/, ' e $1');
}

/**
 * Botão de fechar a compra — alto, redondo, na cor do modo.
 *
 * Desabilitado ele fica bege, não translúcido: um laranja apagado ainda
 * parece clicável, e quem toca e nada acontece acha que a página travou.
 */
export function SubmitButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  icon,
  variant = 'solid',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  variant?: 'solid' | 'outline';
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      // Desabilitar durante o envio evita o toque duplo que vira dois pedidos.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'flex h-13 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-[background-color,box-shadow,transform,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed',
        variant === 'solid'
          ? 'bg-mode text-ink-inverse shadow-[0_14px_28px_-14px_var(--color-mode)] hover:bg-mode-strong disabled:bg-sand-300 disabled:text-ink-muted disabled:shadow-none'
          : 'bg-surface text-ink ring-1 ring-inset ring-border hover:ring-border-strong disabled:opacity-50',
      )}
    >
      {loading ? <Spinner size={20} /> : icon}
      {children}
    </button>
  );
}

/**
 * Escolhas da vitrine: fichas e cartões em vez de `<select>`.
 *
 * No celular o select abre a roleta do sistema para escolher entre quatro
 * opções que cabem numa linha. Por baixo, tudo aqui é rádio nativo: setas do
 * teclado e leitor de tela funcionam sem nenhuma linha a mais.
 */

export const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  meal_voucher: 'Vale-refeição',
  bank_transfer: 'Transferência',
  other: 'Outro',
};

const FOCUS_RING =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mode';

export function PaymentChoice({
  methods,
  value,
  onChange,
  name,
}: {
  methods: PaymentMethod[];
  value: PaymentMethod | '';
  onChange: (value: PaymentMethod | '') => void;
  name: string;
}) {
  const options: Array<[PaymentMethod | '', string]> = [
    ...methods.map((method): [PaymentMethod, string] => [method, PAYMENT_LABELS[method] ?? method]),
    ['', 'Combinar com a loja'],
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Forma de pagamento</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([option, label]) => (
          <label
            key={option || 'combinar'}
            className={cn(
              'cursor-pointer rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink-soft transition-[background-color,border-color,color,transform] duration-200 hover:border-border-strong active:scale-95',
              'has-[:checked]:border-mode has-[:checked]:bg-mode has-[:checked]:font-medium has-[:checked]:text-ink-inverse',
              FOCUS_RING,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Cartão de opção grande, com ícone — "Entrega" ou "Retirada". */
export function OptionCard({
  name,
  checked,
  onSelect,
  icon,
  title,
  description,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col items-start gap-2.5 rounded-2xl border p-3.5 transition-[border-color,background-color,box-shadow] duration-300',
        checked
          ? 'border-mode bg-mode-soft shadow-[inset_0_0_0_1px_var(--color-mode)]'
          : 'border-border bg-surface hover:border-border-strong',
        FOCUS_RING,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        className={cn(
          'grid size-10 place-items-center rounded-full transition-colors duration-300',
          checked ? 'bg-mode text-ink-inverse' : 'bg-sand-200 text-ink-soft',
        )}
      >
        {icon}
      </span>
      <span className="leading-tight">
        <span className="block text-[0.95rem] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>
      </span>
      {checked ? (
        <span className="absolute right-3 top-3 grid size-5 animate-pop place-items-center rounded-full bg-mode text-ink-inverse">
          <CheckIcon size={13} strokeWidth={2.5} />
        </span>
      ) : null}
    </label>
  );
}

/** Bloco da página: superfície clara, cantos largos, título opcional. */
export function Panel({
  title,
  aside,
  children,
  className,
  id,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-20 rounded-[1.5rem] bg-surface p-4 shadow-soft ring-1 ring-border/70 sm:p-5',
        className,
      )}
    >
      {title ? (
        <header className="mb-3.5 flex items-baseline justify-between gap-3">
          <h2 className="text-lg text-ink">{title}</h2>
          {aside ? <span className="text-sm text-ink-muted">{aside}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
