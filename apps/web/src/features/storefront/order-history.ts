'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Histórico de pedidos e encomendas — por APARELHO, não por conta.
 *
 * A vitrine não tem login de cliente (D4): o telefone é a chave natural, e só
 * ele não basta para listar pedidos sem abrir uma forma de enumerar números
 * alheios. Este histórico não contorna isso — ele só lembra, neste navegador,
 * quais pedidos ESTE aparelho já fez, para reconsultá-los pelo mesmo caminho
 * de código+telefone que a página de acompanhamento já usa. Mesmo padrão do
 * carrinho (`cart.tsx`): por loja, em `localStorage`, tolerante a storage
 * bloqueado.
 */

export interface OrderHistoryEntry {
  kind: 'order' | 'preorder';
  code: number;
  phone: string;
  placedAt: string;
}

const MAX_ENTRIES = 20;

function storageKey(host: string): string {
  return `cantina:orders:${host}`;
}

function readHistory(host: string): OrderHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(host));
    return raw ? (JSON.parse(raw) as OrderHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** Chamado pelo checkout e pela encomenda, logo depois do envio dar certo. */
export function recordOrder(host: string, entry: OrderHistoryEntry): void {
  try {
    const current = readHistory(host).filter(
      (item) => !(item.kind === entry.kind && item.code === entry.code),
    );
    localStorage.setItem(
      storageKey(host),
      JSON.stringify([entry, ...current].slice(0, MAX_ENTRIES)),
    );
  } catch {
    // Storage bloqueado não pode impedir o pedido — ele só não entra na lista.
  }
}

export function useOrderHistory(host: string): {
  entries: OrderHistoryEntry[];
  ready: boolean;
  clear: () => void;
} {
  const [entries, setEntries] = useState<OrderHistoryEntry[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(() => {
    setEntries(readHistory(host));
    setReady(true);
  }, [host]);

  useEffect(() => {
    load();
  }, [load]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(host));
    } catch {
      /* idem */
    }
    setEntries([]);
  }, [host]);

  return { entries, ready, clear };
}
