'use client';

import { useId } from 'react';

import { cn } from '../../lib/cn';

/**
 * Interruptor.
 *
 * Um `<button role="switch">` e não uma checkbox estilizada: o papel é o que
 * faz o leitor de tela anunciar "ligado/desligado" em vez de "marcado", que é
 * o significado certo para pausar um produto na vitrine.
 *
 * O trilho é um flex com respiro interno, e a bolinha anda por `translate`
 * DENTRO dele. A versão anterior posicionava a bolinha com `absolute` sem
 * `left`: dentro de um `<button>`, que centraliza o conteúdo, a posição de
 * partida dela era o meio do trilho — desligado parecia ligado e, ligado, a
 * bolinha vazava para fora do contêiner.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          // 44 × 24 com 2px de respiro: a bolinha de 20px anda exatamente 20px.
          'mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5',
          'transition-colors duration-200 focus-visible:rounded-full',
          'disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-primary hover:bg-primary-hover' : 'bg-sand-300 hover:bg-sand-400',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-5 rounded-full bg-sand-50 shadow-soft transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>

      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
