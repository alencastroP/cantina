'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Carrinho da vitrine.
 *
 * Vive no `localStorage`, por loja — o cliente não tem conta (D4), então não
 * há onde guardar isso no servidor. E ele PRECISA sobreviver a um reload: quem
 * monta um pedido no celular troca de app, recebe uma ligação, volta. Perder o
 * carrinho aí é perder a venda.
 *
 * Guarda nome e preço junto do id, para a sacola renderizar sem consultar o
 * cardápio. O total é sempre PRÉVIA: o servidor recalcula com o preço vigente
 * no instante do envio.
 */

export interface CartItem {
  variantId: string;
  productName: string;
  variantName: string | null;
  priceCents: number;
  qty: number;
  notes?: string;
}

interface CartValue {
  items: CartItem[];
  subtotalCents: number;
  count: number;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** `false` até o `localStorage` ser lido — evita piscar carrinho vazio. */
  ready: boolean;
}

const CartContext = createContext<CartValue | null>(null);

function storageKey(host: string): string {
  return `cantina:cart:${host}`;
}

export function CartProvider({ host, children }: { host: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(host));
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      // Storage bloqueado (aba anônima, cookies desligados) não pode impedir
      // a compra — o carrinho apenas não sobrevive ao reload.
    }
    setReady(true);
  }, [host]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey(host), JSON.stringify(items));
    } catch {
      /* idem */
    }
  }, [items, host, ready]);

  const add = useCallback<CartValue['add']>((item, qty = 1) => {
    setItems((current) => {
      // Somar em vez de repetir a linha: "mais uma coxinha" é a mesma coxinha.
      const index = current.findIndex((line) => line.variantId === item.variantId);
      if (index === -1) return [...current, { ...item, qty }];

      return current.map((line, i) =>
        i === index ? { ...line, qty: line.qty + qty } : line,
      );
    });
  }, []);

  const setQty = useCallback<CartValue['setQty']>((variantId, qty) => {
    setItems((current) =>
      qty <= 0
        ? current.filter((line) => line.variantId !== variantId)
        : current.map((line) => (line.variantId === variantId ? { ...line, qty } : line)),
    );
  }, []);

  const remove = useCallback<CartValue['remove']>((variantId) => {
    setItems((current) => current.filter((line) => line.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartValue>(
    () => ({
      items,
      subtotalCents: items.reduce((total, line) => total + line.priceCents * line.qty, 0),
      count: items.reduce((total, line) => total + line.qty, 0),
      add,
      setQty,
      remove,
      clear,
      ready,
    }),
    [items, add, setQty, remove, clear, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart precisa estar dentro de <CartProvider>.');
  return context;
}
