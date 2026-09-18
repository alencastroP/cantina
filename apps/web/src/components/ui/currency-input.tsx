'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';

import { controlClasses, isInvalid } from './field';

/**
 * Entrada de valor em reais que emite CENTAVOS.
 *
 * A API trabalha em centavos inteiros (invariante 8) e o lojista digita
 * "7,50". Fazer essa conversão em cada formulário é como um `parseFloat`
 * escondido acaba arredondando um preço para menos em alguma tela.
 *
 * O campo digita da direita para a esquerda, como maquininha: cada dígito
 * empurra o valor. Isso elimina a ambiguidade entre "7", "7,0" e "7,00", e é
 * o comportamento que quem trabalha com caixa já espera.
 */

const brl = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function format(cents: number): string {
  return brl.format(cents / 100);
}

export interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (cents: number) => void;
  invalid?: boolean;
}

export function CurrencyInput({
  value,
  onValueChange,
  invalid,
  className,
  ...props
}: CurrencyInputProps) {
  const [text, setText] = useState(() => format(value));

  // Mantém o campo em dia quando o valor muda de fora (carregou do servidor,
  // formulário resetado). Só reformata se o número realmente divergir, senão
  // o cursor pularia a cada tecla.
  useEffect(() => {
    setText((current) => {
      const currentCents = Number.parseInt(current.replace(/\D/g, ''), 10) || 0;
      return currentCents === value ? current : format(value);
    });
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted">
        R$
      </span>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
          const cents = digits === '' ? 0 : Number.parseInt(digits, 10);
          setText(format(cents));
          onValueChange(cents);
        }}
        // Selecionar tudo no foco: o valor é substituído, não editado no
        // meio — e digitar sobre "0,00" sem apagar antes é o que se espera.
        onFocus={(event) => {
          event.currentTarget.select();
          props.onFocus?.(event);
        }}
        className={controlClasses(
          isInvalid(invalid, props['aria-invalid']),
          'h-11 pl-10 text-right tabular-nums',
          className,
        )}
      />
    </div>
  );
}
