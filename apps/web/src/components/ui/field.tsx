'use client';

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '../../lib/cn';

/**
 * Campos de formulário.
 *
 * `Field` gera o id e amarra rótulo, dica e erro por `aria-describedby` — a
 * amarração é o que faz o leitor de tela anunciar o erro junto com o campo,
 * em vez de deixá-lo perdido na página.
 *
 * O input é mais escuro que o fundo (`bg-sunken`), não mais claro: sobre bege,
 * um campo branco parece um cartão, e um campo cavado parece um campo. No
 * foco ele "sobe" para a superfície e ganha um halo terracota — mais macio que
 * o contorno duro, e visível o bastante para quem navega por teclado.
 *
 * Três decisões que valem para todo campo, e por isso moram aqui:
 *
 *   - 16px no celular. O iOS dá zoom na página inteira ao focar um campo com
 *     fonte menor que isso — e o lojista perde o formulário de vista.
 *   - O estado inválido sai do `aria-invalid` que o `Field` já injeta. Quem
 *     espalha `{...props}` não precisa lembrar de repetir `invalid`.
 *   - E-mail não ganha maiúscula automática nem corretor: o teclado do
 *     celular transformava "maria@" em "Maria@".
 */

const CONTROL_BASE =
  'w-full rounded-control border bg-sunken px-3 text-base text-ink sm:text-sm ' +
  'placeholder:text-ink-muted/80 transition-[border-color,background-color,box-shadow] duration-150 ' +
  'focus-visible:bg-surface focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const CONTROL_TONE = {
  normal:
    'border-border hover:border-border-strong focus-visible:border-clay-400 ' +
    'focus-visible:shadow-[0_0_0_3px_var(--color-clay-100)]',
  invalid:
    'border-danger-500 bg-danger-50 focus-visible:border-danger-500 ' +
    'focus-visible:shadow-[0_0_0_3px_var(--color-danger-50)]',
};

/** Classes de controle — as mesmas para input, select, dinheiro e quantidade. */
export function controlClasses(invalid: boolean, ...extra: Array<string | false | undefined>) {
  return cn(CONTROL_BASE, invalid ? CONTROL_TONE.invalid : CONTROL_TONE.normal, ...extra);
}

/** `invalid` explícito ganha; senão, vale o que o `Field` disse. */
export function isInvalid(
  invalid: boolean | undefined,
  ariaInvalid: InputHTMLAttributes<HTMLElement>['aria-invalid'],
): boolean {
  return invalid ?? (ariaInvalid === true || ariaInvalid === 'true');
}

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  /** Ação ao lado do rótulo, alinhada à direita — "Esqueci minha senha". */
  labelAction?: ReactNode;
  className?: string;
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
  }) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  labelAction,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium text-ink-soft">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger-500" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {labelAction ? <div className="shrink-0 text-sm">{labelAction}</div> : null}
      </div>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}

      {/* O erro vem antes da dica: é o que precisa ser lido primeiro. A dica
          continua visível — quase sempre ela é a explicação do erro. */}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger-700">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** `md` é o padrão de formulário; `sm` é para barras de filtro, ao lado de botões `sm`. */
type ControlSize = 'md' | 'sm';
const CONTROL_HEIGHT: Record<ControlSize, string> = { md: 'h-11', sm: 'h-9' };

export function Input({
  className,
  invalid,
  type,
  controlSize = 'md',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; controlSize?: ControlSize }) {
  const emailDefaults =
    type === 'email'
      ? { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
      : {};

  return (
    <input
      type={type}
      {...emailDefaults}
      {...props}
      className={controlClasses(
        isInvalid(invalid, props['aria-invalid']),
        CONTROL_HEIGHT[controlSize],
        className,
      )}
    />
  );
}

export function Textarea({
  className,
  invalid,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      {...props}
      className={controlClasses(
        isInvalid(invalid, props['aria-invalid']),
        'resize-y py-2.5 leading-relaxed',
        className,
      )}
    />
  );
}

export function Select({
  className,
  invalid,
  controlSize = 'md',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; controlSize?: ControlSize }) {
  return (
    <select
      {...props}
      className={controlClasses(
        isInvalid(invalid, props['aria-invalid']),
        CONTROL_HEIGHT[controlSize],
        'cursor-pointer appearance-none pr-9',
        // Seta desenhada em CSS: evita uma imagem só para isto.
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b7659%22 stroke-width=%222%22 stroke-linecap=%22round%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:18px] bg-[right_0.75rem_center] bg-no-repeat",
        className,
      )}
    >
      {children}
    </select>
  );
}
