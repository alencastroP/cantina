'use client';

import { useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';

import { EyeIcon, EyeOffIcon } from '../layout/icons';
import { controlClasses, isInvalid } from './field';

/**
 * Campo de senha.
 *
 * Três coisas que o `<input type="password">` puro não faz, e que são as
 * maiores causas de "errei a senha" num celular de balcão:
 *
 *   Mostrar      digitar às cegas num teclado pequeno é o erro mais comum. O
 *                botão fica DENTRO do campo, não rouba o foco (quem está
 *                digitando continua digitando) e diz o que faz por extenso.
 *   Caps Lock    aviso enquanto está ligado, amarrado ao campo por
 *                `aria-describedby` — o leitor de tela também avisa.
 *   Colar        permitido. Gerenciador de senha depende disso, e bloquear
 *                colar só empurra as pessoas para senhas mais fracas.
 */
export function PasswordInput({
  className,
  invalid,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const capsId = props.id ? `${props.id}-caps` : undefined;
  const describedBy =
    [props['aria-describedby'], capsLock ? capsId : undefined].filter(Boolean).join(' ') ||
    undefined;

  function detectCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState('CapsLock'));
  }

  return (
    <div>
      <div className="relative">
        <input
          {...props}
          type={visible ? 'text' : 'password'}
          aria-describedby={describedBy}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(event) => {
            detectCapsLock(event);
            props.onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            detectCapsLock(event);
            props.onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            props.onBlur?.(event);
          }}
          className={controlClasses(
            isInvalid(invalid, props['aria-invalid']),
            'h-11 pr-28',
            className,
          )}
        />
        <button
          type="button"
          // Sem isto, clicar tira o foco do campo e o teclado do celular fecha.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-controls={props.id}
          className="absolute inset-y-1.5 right-1.5 inline-flex items-center gap-1.5 rounded-[0.5rem] px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-sand-300/60 hover:text-ink"
        >
          {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          {visible ? 'Ocultar' : 'Mostrar'}
          <span className="sr-only"> senha</span>
        </button>
      </div>

      {capsLock ? (
        <p id={capsId} className="mt-1.5 text-sm text-warning-700">
          O Caps Lock está ligado.
        </p>
      ) : null}
    </div>
  );
}
