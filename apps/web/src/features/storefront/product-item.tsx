'use client';

import type { MenuProduct, MenuVariant } from '@cantina/contracts';
import { useEffect, useId, useState } from 'react';

import { PlusIcon } from '../../components/layout/icons';
import { cn } from '../../lib/cn';
import { formatCents } from '../../lib/format';
import { Sheet, SheetCloseButton } from './sheet';
import { Stepper } from './stepper';

/**
 * Produto no cardápio — o mesmo nos dois modos.
 *
 * O item não sabe se está na sacola (delivery) ou na encomenda: quem chama
 * passa a quantidade atual e o que fazer com ela, e a cor vem do `[data-mode]`
 * de cima. Os dois carrinhos continuam separados (FRONTEND.md).
 *
 * A linha inteira abre o detalhe; o + adiciona sem sair da lista. Depois do
 * primeiro toque o + vira contador ali mesmo — "mais uma coxinha" não precisa
 * de outra tela.
 */

const TINTS = [
  'bg-clay-100 text-clay-400',
  'bg-olive-100 text-olive-500',
  'bg-sand-200 text-sand-500',
  'bg-warning-50 text-warning-500',
];

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

/**
 * Foto do produto ou, sem foto, a inicial dele — grande e cortada, de
 * propósito. Loja pequena quase nunca tem foto de tudo, e um ícone genérico
 * de prato repetido vinte vezes parece cardápio abandonado.
 */
export function ProductMedia({
  product,
  className,
}: {
  product: Pick<MenuProduct, 'name' | 'imageUrl' | 'soldOut'>;
  className?: string;
}) {
  if (product.imageUrl) {
    return (
      <div className={cn('overflow-hidden bg-sand-200', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt=""
          loading="lazy"
          className={cn('size-full object-cover', product.soldOut && 'grayscale')}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden [container-type:size]',
        TINTS[hash(product.name) % TINTS.length],
        product.soldOut && 'grayscale',
        className,
      )}
    >
      <span className="absolute inset-0 opacity-30 [background-image:radial-gradient(currentColor_1px,transparent_1.5px)] [background-size:9px_9px]" />
      <span className="absolute -bottom-[0.2em] right-[0.08em] select-none font-display text-[length:min(82cqw,110cqh)] italic leading-none">
        {product.name.trim().charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export function Price({
  cents,
  compareAt = null,
  from = false,
  className,
}: {
  cents: number;
  compareAt?: number | null;
  from?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-wrap items-baseline gap-x-1.5', className)}>
      {from ? <span className="text-xs text-ink-muted">a partir de</span> : null}
      {compareAt ? (
        <span className="text-xs text-ink-muted line-through" data-numeric>
          {formatCents(compareAt)}
        </span>
      ) : null}
      <span className="font-semibold text-ink" data-numeric>
        {formatCents(cents)}
      </span>
    </span>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-10 place-items-center rounded-full bg-mode text-ink-inverse shadow-[0_8px_18px_-8px_var(--color-mode)] transition-[background-color,transform] duration-200 hover:bg-mode-strong active:scale-90"
    >
      <PlusIcon size={20} />
    </button>
  );
}

export function ProductItem({
  product,
  index,
  qtyOf,
  onOpen,
  onSetQty,
}: {
  product: MenuProduct;
  /** Posição na lista — só para escalonar a entrada. */
  index: number;
  qtyOf: (variantId: string) => number;
  onOpen: () => void;
  onSetQty: (variant: MenuVariant, qty: number) => void;
}) {
  const single = product.variants.length === 1 ? (product.variants[0] ?? null) : null;
  const cheapest = Math.min(...product.variants.map((variant) => variant.priceCents));
  const total = product.variants.reduce((sum, variant) => sum + qtyOf(variant.id), 0);
  const singleQty = single ? qtyOf(single.id) : 0;

  return (
    <article
      className={cn('group relative flex animate-rise gap-3.5 py-4', product.soldOut && 'opacity-60')}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <div className="relative shrink-0">
        <ProductMedia
          product={product}
          className="size-[5.5rem] rounded-[1.35rem] transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
        />
        {total > 0 && !single ? (
          <span
            key={total}
            className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 animate-pop place-items-center rounded-full bg-mode px-1.5 text-xs font-semibold text-ink-inverse shadow-soft ring-2 ring-canvas"
            data-numeric
          >
            {total}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[1.0625rem] leading-snug text-ink">
          {/* O `after` estica o botão sobre a linha toda: tocar em qualquer
              ponto abre o detalhe, e o contador fica por cima (`z-10`). */}
          <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0">
            {product.name}
          </button>
        </h3>

        {product.description ? (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-muted">
            {product.description}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-2.5">
          <Price
            cents={single ? single.priceCents : cheapest}
            compareAt={single?.compareAtPriceCents ?? null}
            from={!single}
          />

          <div className="relative z-10">
            {product.soldOut ? (
              <span className="inline-flex rounded-full bg-sand-200 px-3 py-1.5 text-xs font-medium text-ink-muted">
                Esgotado
              </span>
            ) : single && singleQty > 0 ? (
              <Stepper
                qty={singleQty}
                max={single.availableUnits}
                label={product.name}
                onChange={(qty) => onSetQty(single, qty)}
                className="animate-pop"
              />
            ) : (
              <AddButton
                label={single ? `Adicionar ${product.name}` : `Escolher opção de ${product.name}`}
                onClick={() => (single ? onSetQty(single, 1) : onOpen())}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Detalhe do produto numa folha: foto grande, descrição inteira, variações e
 * quantidade. É onde se escolhe "tamanho G" — a lista não tem espaço para isso
 * sem virar formulário.
 */
export function ProductSheet({
  product,
  open,
  onClose,
  qtyOf,
  onAdd,
  bagLabel,
}: {
  /** Continua preenchido depois de fechar, para a folha descer com conteúdo. */
  product: MenuProduct | null;
  open: boolean;
  onClose: () => void;
  qtyOf: (variantId: string) => number;
  onAdd: (variant: MenuVariant, qty: number) => void;
  bagLabel: string;
}) {
  const titleId = useId();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!open || !product) return;
    const first =
      product.variants.find((variant) => variant.availableUnits !== 0) ?? product.variants[0];
    setVariantId(first?.id ?? null);
    setQty(1);
  }, [open, product]);

  if (!product) return <Sheet open={false} onClose={onClose} label="Produto">{null}</Sheet>;

  const variant = product.variants.find((item) => item.id === variantId) ?? null;
  const already = product.variants.reduce((sum, item) => sum + qtyOf(item.id), 0);
  // Quanto ainda cabe, descontado o que já está no carrinho.
  const room =
    variant && variant.availableUnits !== null
      ? variant.availableUnits - qtyOf(variant.id)
      : null;
  const unavailable = !variant || (room !== null && room <= 0);

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <div className="relative shrink-0">
        <ProductMedia product={product} className="h-44 w-full sm:h-52" />
        <SheetCloseButton
          onClose={onClose}
          className="absolute right-3 top-3 bg-surface/85 backdrop-blur"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-5">
        <h2 id={titleId} className="text-[1.7rem] leading-tight text-ink">
          {product.name}
        </h2>
        {product.description ? (
          <p className="mt-2 leading-relaxed text-ink-soft">{product.description}</p>
        ) : null}

        {product.variants.length > 1 ? (
          <fieldset className="mt-6 min-w-0">
            <legend className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Escolha uma opção
            </legend>
            <div className="space-y-2">
              {product.variants.map((item) => {
                const soldOut = item.availableUnits === 0;
                const selected = item.id === variantId;
                return (
                  <label
                    key={item.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-[border-color,background-color,box-shadow] duration-200',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mode',
                      selected
                        ? 'border-mode bg-mode-soft shadow-[inset_0_0_0_1px_var(--color-mode)]'
                        : 'border-border hover:border-border-strong',
                      soldOut && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <input
                      type="radio"
                      name={`variant-${product.id}`}
                      className="sr-only"
                      checked={selected}
                      disabled={soldOut}
                      onChange={() => {
                        setVariantId(item.id);
                        setQty(1);
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200',
                        selected ? 'border-mode' : 'border-border-strong',
                      )}
                    >
                      <span
                        className={cn(
                          'size-2.5 rounded-full bg-mode transition-transform duration-300 ease-[var(--ease-spring)]',
                          selected ? 'scale-100' : 'scale-0',
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1 text-[0.95rem] text-ink">
                      {item.name}
                      {soldOut ? <span className="ml-1.5 text-xs text-ink-muted">esgotado</span> : null}
                    </span>
                    <Price cents={item.priceCents} compareAt={item.compareAtPriceCents} />
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : variant ? (
          <Price cents={variant.priceCents} compareAt={variant.compareAtPriceCents} className="mt-4 text-lg" />
        ) : null}

        {already > 0 ? (
          <p className="mt-5 inline-flex items-center rounded-full bg-mode-soft px-3 py-1 text-sm text-mode-ink">
            <span data-numeric>{already}</span>&nbsp;{bagLabel}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
        <Stepper qty={qty} min={1} max={room} label={product.name} onChange={setQty} />
        <button
          type="button"
          disabled={unavailable}
          onClick={() => {
            if (!variant) return;
            onAdd(variant, qty);
            onClose();
          }}
          className="flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-full bg-mode pl-5 pr-2 font-medium text-ink-inverse shadow-[0_10px_24px_-10px_var(--color-mode)] transition-[background-color,transform] duration-200 hover:bg-mode-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{unavailable ? 'Esgotado' : 'Adicionar'}</span>
          <span data-numeric className="rounded-full bg-ink-inverse/15 px-3 py-1.5 text-sm">
            {formatCents((variant?.priceCents ?? 0) * qty)}
          </span>
        </button>
      </div>
    </Sheet>
  );
}
