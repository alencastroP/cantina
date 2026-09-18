'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { CloseIcon } from '../layout/icons';

/**
 * Diálogo.
 *
 * `<dialog>` nativo com `showModal()`: o navegador já prende o foco, fecha no
 * Esc, deixa o resto da página inerte e devolve o foco a quem abriu. É a
 * "acessibilidade complexa" que o FRONTEND.md reservava para o Radix — e o
 * navegador entrega sem dependência nenhuma.
 *
 * No celular vira folha que sobe da base, onde o polegar alcança; do tablet
 * para cima, janela centralizada. O conteúdo só existe enquanto está aberto:
 * reabrir começa um formulário limpo, sem restos da vez anterior.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Dispara no Esc e em `close()`: um caminho só para avisar o pai.
      onClose={onClose}
      // O clique no próprio `<dialog>` só acontece no fundo escurecido: o
      // conteúdo ocupa toda a caixa.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-0 mt-auto max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[1.25rem] bg-surface p-0 text-ink shadow-raised open:flex',
        'backdrop:bg-sand-900/35 backdrop:backdrop-blur-[2px]',
        'sm:m-auto sm:max-w-lg sm:rounded-card',
        className,
      )}
    >
      {open ? (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-xl text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1.5 -mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-sand-200 hover:text-ink"
            >
              <CloseIcon size={18} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          ) : null}
        </>
      ) : null}
    </dialog>
  );
}
