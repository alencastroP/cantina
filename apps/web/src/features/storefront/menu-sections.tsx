'use client';

import type { Menu, MenuProduct, MenuVariant } from '@cantina/contracts';
import { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { scrollToElement } from './motion';
import { ProductItem, ProductSheet } from './product-item';

/**
 * O que o cardápio precisa saber de um carrinho — qualquer um dos dois.
 *
 * Delivery e encomenda passam implementações diferentes (uma no
 * `localStorage`, outra no estado do formulário), e o cardápio não distingue.
 */
export interface MenuCart {
  qtyOf: (variantId: string) => number;
  /** Soma à quantidade atual — o "Adicionar" do detalhe. */
  add: (product: MenuProduct, variant: MenuVariant, qty: number) => void;
  /** Define a quantidade — o contador da lista. Zero remove. */
  setQty: (product: MenuProduct, variant: MenuVariant, qty: number) => void;
  /** "na sacola", "na encomenda" — o detalhe diz onde o produto já está. */
  bagLabel: string;
}

interface Group {
  key: string;
  name: string;
  products: MenuProduct[];
}

export function menuGroups(menu: Menu): Group[] {
  return [
    ...menu.categories.map((category) => ({
      key: category.id,
      name: category.name,
      products: category.products,
    })),
    ...(menu.uncategorized.length > 0
      ? [{ key: 'outros', name: 'Outros', products: menu.uncategorized }]
      : []),
  ];
}

/** Qual seção está no terço de cima da tela agora. */
function useScrollSpy(keys: string[]) {
  const [value, set] = useState<string | null>(keys[0] ?? null);
  const signature = keys.join('|');

  useEffect(() => {
    const elements = signature
      .split('|')
      .map((key) => document.getElementById(`cat-${key}`))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length < 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) set(hit.target.id.slice('cat-'.length));
      },
      { rootMargin: '-30% 0px -65% 0px' },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [signature]);

  return { value, set };
}

/**
 * Trilho de categorias.
 *
 * Gruda logo abaixo da barra compacta (`top-14`, os 3,5rem dela) e acompanha a
 * rolagem: a ficha da seção visível acende e o trilho corre para mantê-la à
 * vista. Com dez categorias, é o índice que falta num cardápio de celular.
 */
function CategoryRail({
  groups,
  active,
  onPick,
}: {
  groups: Group[];
  active: string | null;
  onPick: (key: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !chip) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({
      left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [active]);

  return (
    <nav aria-label="Categorias" className="sticky top-14 z-20 -mx-4 mb-2 bg-canvas/85 backdrop-blur-md">
      <div
        ref={railRef}
        data-scroll-x
        className="no-scrollbar relative flex gap-2 overflow-x-auto px-4 py-2.5"
      >
        {groups.map((group) => {
          const on = group.key === active;
          return (
            <button
              key={group.key}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onPick(group.key)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-300',
                on
                  ? 'bg-ink text-canvas shadow-soft'
                  : 'bg-surface text-ink-soft ring-1 ring-inset ring-border hover:ring-border-strong',
              )}
            >
              {group.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function MenuSections({ menu, cart }: { menu: Menu; cart: MenuCart }) {
  const groups = menuGroups(menu);
  const spy = useScrollSpy(groups.map((group) => group.key));

  // O produto fica guardado depois de fechar: a folha desce com conteúdo.
  const [sheetProduct, setSheetProduct] = useState<MenuProduct | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Índice corrido entre as seções, para a entrada escalonar a lista toda.
  const offsets = groups.reduce<number[]>(
    (list, group, i) => [...list, i === 0 ? 0 : list[i - 1]! + groups[i - 1]!.products.length],
    [],
  );

  return (
    <div>
      {groups.length > 1 ? (
        <CategoryRail
          groups={groups}
          active={spy.value}
          onPick={(key) => {
            spy.set(key);
            scrollToElement(document.getElementById(`cat-${key}`));
          }}
        />
      ) : null}

      <div className="space-y-8">
        {groups.map((group, groupIndex) => (
          <section
            key={group.key}
            id={`cat-${group.key}`}
            aria-labelledby={`cat-${group.key}-title`}
            className="scroll-mt-32"
          >
            <h2
              id={`cat-${group.key}-title`}
              className="flex items-baseline gap-2.5 pt-2 text-[1.45rem] text-ink"
            >
              {group.name}
              <span className="font-sans text-xs font-medium text-ink-muted" data-numeric>
                {group.products.length}
              </span>
            </h2>

            <div className="divide-y divide-dashed divide-border">
              {group.products.map((product, i) => (
                <ProductItem
                  key={product.id}
                  product={product}
                  index={(offsets[groupIndex] ?? 0) + i}
                  qtyOf={cart.qtyOf}
                  onOpen={() => {
                    setSheetProduct(product);
                    setSheetOpen(true);
                  }}
                  onSetQty={(variant, qty) => cart.setQty(product, variant, qty)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ProductSheet
        product={sheetProduct}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        qtyOf={cart.qtyOf}
        bagLabel={cart.bagLabel}
        onAdd={(variant, qty) => {
          if (sheetProduct) cart.add(sheetProduct, variant, qty);
        }}
      />
    </div>
  );
}
