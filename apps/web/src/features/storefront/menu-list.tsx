'use client';

import type { Menu, MenuProduct, MenuVariant } from '@cantina/contracts';

import { useCart, type CartItem } from './cart';
import { MenuSections, type MenuCart } from './menu-sections';

/**
 * Cardápio do "pedir agora".
 *
 * Liga o cardápio compartilhado (`MenuSections`) à sacola persistida. O
 * contador da lista e o "Adicionar" do detalhe escrevem no mesmo lugar, então
 * o que se vê na linha é sempre o que está na sacola.
 */

function toLine(product: MenuProduct, variant: MenuVariant): Omit<CartItem, 'qty'> {
  return {
    variantId: variant.id,
    productName: product.name,
    variantName: variant.name === 'Padrão' ? null : variant.name,
    priceCents: variant.priceCents,
  };
}

export function MenuList({ menu }: { menu: Menu }) {
  const cart = useCart();

  const menuCart: MenuCart = {
    qtyOf: (variantId) => cart.items.find((line) => line.variantId === variantId)?.qty ?? 0,
    add: (product, variant, qty) => cart.add(toLine(product, variant), qty),
    setQty: (product, variant, qty) => {
      if (cart.items.some((line) => line.variantId === variant.id)) cart.setQty(variant.id, qty);
      else if (qty > 0) cart.add(toLine(product, variant), qty);
    },
    bagLabel: 'na sacola',
  };

  if (menu.categories.length === 0 && menu.uncategorized.length === 0) {
    return (
      <div className="animate-rise rounded-[1.5rem] border border-dashed border-border px-6 py-14 text-center">
        <p className="font-display text-xl text-ink">O cardápio está sendo montado</p>
        <p className="mt-1 text-sm text-ink-muted">
          Volte daqui a pouco — a loja está arrumando a vitrine.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-enter-left">
      <MenuSections menu={menu} cart={menuCart} />
    </div>
  );
}
