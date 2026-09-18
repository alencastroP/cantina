'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { CloseIcon } from '../../components/layout/icons';
import { cn } from '../../lib/cn';

/**
 * Folha que sobe da base — a janela da vitrine.
 *
 * `<dialog>` nativo, como o `Dialog` do painel: foco preso, Esc, fundo inerte
 * e foco devolvido a quem abriu. A diferença é a saída animada: o conteúdo
 * continua montado enquanto a folha desce, e quem chama decide o que mostrar.
 * O painel segue com o `Dialog` dele, onde o formulário precisa nascer limpo a
 * cada abertura. A animação é CSS puro (`.sheet` em globals.css).
 */
export function Sheet({
  open,
  onClose,
  label,
  labelledBy,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Nome acessível quando não há título visível; senão, `labelledBy`. */
  label?: string;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A página por trás não rola junto com o dedo enquanto a folha está aberta.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      // Dispara no Esc e em `close()`: um caminho só para avisar o pai.
      onClose={onClose}
      // O clique no próprio `<dialog>` só acontece no fundo escurecido.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn('sheet', className)}
    >
      <div className="relative flex max-h-[92dvh] flex-col">
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-sand-900/20 sm:hidden"
        />
        {children}
      </div>
    </dialog>
  );
}

export function SheetCloseButton({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fechar"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-sand-200/80 text-ink-soft transition-[background-color,transform] duration-200 hover:bg-sand-300 active:scale-90',
        className,
      )}
    >
      <CloseIcon size={18} />
    </button>
  );
}

export function SheetHeader({
  id,
  title,
  description,
  onClose,
}: {
  id: string;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-7">
      <div className="min-w-0">
        <h2 id={id} className="text-[1.6rem] leading-tight text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      <SheetCloseButton onClose={onClose} />
    </header>
  );
}
