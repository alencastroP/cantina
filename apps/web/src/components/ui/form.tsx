'use client';

import {
  useEffect,
  useRef,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/cn';
import { Alert } from './feedback';

/**
 * Formulário.
 *
 * Três coisas que cada tela repetia, ou esquecia:
 *
 *   1. `preventDefault` e `noValidate`. A validação que vale é a da API, com
 *      mensagens em português; a do navegador fala a língua do sistema e o
 *      balão some quando o campo perde o foco.
 *   2. Foco no primeiro erro depois de enviar. Sem isso, num formulário longo
 *      o erro aparece fora da tela — e quem usa leitor de tela nem fica
 *      sabendo que ele existe. É o padrão do GOV.UK: o foco vai ao primeiro
 *      campo inválido e o leitor anuncia rótulo e erro juntos.
 *   3. Enter envia. Um `<div>` com botão de `onClick` não faz isso, e é o
 *      atalho que todo mundo espera ao terminar de digitar.
 */
export function Form({
  onSubmit,
  fieldErrors,
  error,
  children,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => unknown;
  fieldErrors?: Record<string, string>;
  error?: string | null;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const awaitingResult = useRef(false);

  useEffect(() => {
    if (!awaitingResult.current) return;

    const hasFieldErrors = fieldErrors !== undefined && Object.keys(fieldErrors).length > 0;
    if (!hasFieldErrors && !error) return;
    awaitingResult.current = false;

    const form = ref.current;
    if (!form) return;

    // Primeiro o campo; sem campo marcado, o resumo — que diz o que houve.
    const target =
      form.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      form.querySelector<HTMLElement>('[data-form-errors]');
    target?.focus();
  }, [fieldErrors, error]);

  return (
    <form
      ref={ref}
      noValidate
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        awaitingResult.current = true;
        void onSubmit(event);
      }}
    >
      {children}
    </form>
  );
}

/**
 * Resumo de erros no topo do formulário.
 *
 * A mensagem geral da API aparece aqui. E quando só há erros por campo, o
 * resumo os lista — um erro em `variants.0.priceCents` ou em `address` não
 * tem campo na tela com esse nome, e sumiria em silêncio. `labels` dá nome a
 * cada chave; sem ele, a mensagem aparece sozinha.
 */
export function FormErrors({
  error,
  fieldErrors,
  labels,
  className,
}: {
  error?: string | null;
  fieldErrors?: Record<string, string>;
  labels?: Record<string, string>;
  className?: string;
}) {
  const entries = Object.entries(fieldErrors ?? {});
  if (!error && entries.length === 0) return null;

  return (
    <div data-form-errors tabIndex={-1} className={cn('rounded-card outline-none', className)}>
      <Alert
        tone="danger"
        title={
          error ??
          (entries.length === 1
            ? 'Falta corrigir um campo.'
            : `Faltam corrigir ${entries.length} campos.`)
        }
      >
        {entries.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5">
            {entries.map(([key, message]) => (
              <li key={key}>
                {labels?.[key] ? <strong className="font-medium">{labels[key]}: </strong> : null}
                {message}
              </li>
            ))}
          </ul>
        ) : null}
      </Alert>
    </div>
  );
}

/**
 * Rodapé com as ações do formulário.
 *
 * `sticky` gruda o rodapé acima da barra inferior no celular: num formulário
 * longo, o botão de salvar fica sempre ao alcance do polegar, sem rolar até o
 * fim para descobrir onde ele está. No desktop ele volta ao fluxo normal.
 */
export function FormActions({
  children,
  hint,
  sticky = false,
  className,
}: {
  children: ReactNode;
  /** Por que o botão está desabilitado, ou o que acontece ao enviar. */
  hint?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-3',
        sticky &&
          'sticky bottom-[3.875rem] z-20 -mx-4 border-t border-border bg-canvas/90 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none',
        className,
      )}
    >
      {hint ? <p className="mr-auto min-w-0 text-sm text-ink-muted">{hint}</p> : null}
      {children}
    </div>
  );
}
