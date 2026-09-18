'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';

import { controlClasses, isInvalid } from './field';

/**
 * Entrada de quantidade física, com a unidade sempre visível.
 *
 * Aceita vírgula ou ponto — quem digita "1,5" e quem digita "1.5" quer a
 * mesma coisa, e brigar com isso só gera erro de digitação. A unidade fica
 * fixa à direita porque "500" sem saber se é grama ou quilo é a diferença
 * entre um bolo e uma padaria inteira.
 */
export function QuantityInput({
  value,
  onValueChange,
  unit,
  invalid,
  allowNegative = false,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
  unit?: string;
  invalid?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(() => (value === 0 ? '' : String(value).replace('.', ',')));

  useEffect(() => {
    setText((current) => {
      const parsed = Number.parseFloat(current.replace(',', '.'));
      return parsed === value ? current : value === 0 ? '' : String(value).replace('.', ',');
    });
  }, [value]);

  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          const pattern = allowNegative ? /[^\d,.-]/g : /[^\d,.]/g;
          const raw = event.target.value.replace(pattern, '');
          setText(raw);

          const parsed = Number.parseFloat(raw.replace(',', '.'));
          onValueChange(Number.isNaN(parsed) ? 0 : parsed);
        }}
        className={controlClasses(
          isInvalid(invalid, props['aria-invalid']),
          'h-11 tabular-nums',
          unit && 'pr-16',
          className,
        )}
      />
      {unit ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">
          {unit}
        </span>
      ) : null}
    </div>
  );
}
