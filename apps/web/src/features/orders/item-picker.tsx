'use client';

import type { Page as ApiPage, Product } from '@cantina/contracts';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { EmptyState, Skeleton } from '../../components/ui/feedback';
import { Input } from '../../components/ui/field';
import { formatCents } from '../../lib/format';
import { useApi, useDebounced } from '../../lib/use-api';

/**
 * Linha do carrinho no lançamento manual.
 *
 * Guarda nome e preço junto do id porque o total mostrado é uma PRÉVIA: o
 * servidor recalcula tudo ao criar o pedido, com o preço vigente naquele
 * instante. Se os dois divergirem, o do servidor é o que vale — e é por isso
 * que a tela avisa que o valor é estimado.
 */
export interface CartLine {
  productVariantId: string;
  label: string;
  unitPriceCents: number;
  qty: number;
  notes?: string;
}

export function ItemPicker({ onAdd }: { onAdd: (line: CartLine) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);

  const query = new URLSearchParams({ limit: '15', active: 'true' });
  if (debounced.length >= 2) query.set('q', debounced);

  const products = useApi<ApiPage<Product>>(`/products?${query.toString()}`);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar produto…"
        aria-label="Buscar produto"
      />

      {products.loading && !products.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : null}

      {products.data && products.data.items.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" />
      ) : null}

      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {products.data?.items.flatMap((product) =>
          product.variants
            .filter((variant) => variant.active)
            .map((variant) => {
              const label =
                variant.name && variant.name !== 'Padrão'
                  ? `${product.name} (${variant.name})`
                  : product.name;

              return (
                <li key={variant.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onAdd({
                        productVariantId: variant.id,
                        label,
                        unitPriceCents: variant.priceCents,
                        qty: 1,
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-sand-200"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{label}</span>
                    <span className="shrink-0 text-sm text-ink-soft" data-numeric>
                      {formatCents(variant.priceCents)}
                    </span>
                  </button>
                </li>
              );
            }),
        )}
      </ul>
    </div>
  );
}

export function CartLines({
  lines,
  onChange,
}: {
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
        Nenhum item ainda. Busque acima para adicionar.
      </p>
    );
  }

  function update(index: number, patch: Partial<CartLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {lines.map((line, index) => (
        <li key={line.productVariantId} className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Diminuir ${line.label}`}
              onClick={() =>
                line.qty <= 1
                  ? onChange(lines.filter((_, i) => i !== index))
                  : update(index, { qty: line.qty - 1 })
              }
            >
              −
            </Button>
            <span className="w-6 text-center text-sm font-medium text-ink" data-numeric>
              {line.qty}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Aumentar ${line.label}`}
              onClick={() => update(index, { qty: line.qty + 1 })}
            >
              +
            </Button>
          </div>

          <span className="min-w-0 flex-1 truncate text-sm text-ink">{line.label}</span>

          <span className="shrink-0 text-sm text-ink" data-numeric>
            {formatCents(line.unitPriceCents * line.qty)}
          </span>
        </li>
      ))}
    </ul>
  );
}
