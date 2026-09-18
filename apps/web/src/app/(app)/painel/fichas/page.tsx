'use client';

import type { Page as ApiPage, Product } from '@cantina/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Badge } from '../../../../components/ui/badge';
import { LinkButton } from '../../../../components/ui/button';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { Input } from '../../../../components/ui/field';
import { useCostSummary } from '../../../../features/recipes/cost-summary';
import { formatCents, formatPercent } from '../../../../lib/format';
import { useApi, useDebounced } from '../../../../lib/use-api';

/**
 * Escolha da variação para editar a ficha técnica.
 *
 * Cada variação mostra se já tem ficha e, tendo, quanto custa e quanto sobra
 * no canal padrão. O sinal vem de `/pricing/summary`, uma requisição para a
 * lista inteira — era a lacuna do FRONTEND.md: sem ele, descobrir quem ainda
 * não tinha receita custava uma consulta por variação.
 */
export default function FichasPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);

  const query = new URLSearchParams({ limit: '50' });
  if (debounced.length >= 2) query.set('q', debounced);

  const products = useApi<ApiPage<Product>>(`/products?${query.toString()}`);
  const costs = useCostSummary(
    (products.data?.items ?? []).flatMap((product) =>
      product.variants.map((variant) => variant.id),
    ),
    true,
  );

  const missing = (products.data?.items ?? [])
    .flatMap((product) => product.variants)
    .filter((variant) => costs.get(variant.id)?.hasRecipe === false).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Fichas técnicas"
        description="A receita de cada produto — é dela que sai o custo real."
        action={
          <LinkButton href="/painel/fichas/canais" variant="secondary" size="sm">
            Canais de venda
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar produto…"
          aria-label="Buscar produto"
          className="max-w-sm"
        />
        {missing > 0 ? (
          <p className="text-sm text-warning-700">
            {missing === 1 ? '1 variação sem ficha' : `${missing} variações sem ficha`} — o custo
            delas entra como zero.
          </p>
        ) : null}
      </div>

      {products.error ? (
        <Alert tone="danger" title="Não foi possível carregar os produtos.">
          {products.error.message}
        </Alert>
      ) : null}

      {products.loading && !products.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : null}

      {products.data && products.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum produto"
          description="Cadastre um produto antes de montar a ficha técnica."
          action={
            <LinkButton href="/painel/produtos/novo" variant="primary">
              Cadastrar produto
            </LinkButton>
          }
        />
      ) : null}

      <ul className="space-y-3">
        {products.data?.items.map((product) => (
          <li
            key={product.id}
            className="overflow-hidden rounded-card border border-border bg-surface shadow-soft"
          >
            <div className="border-b border-border px-4 py-2.5">
              <p className="font-medium text-ink">{product.name}</p>
              <p className="text-sm text-ink-muted">
                {product.categoryName ?? 'Sem categoria'}
              </p>
            </div>

            <ul className="divide-y divide-border">
              {product.variants.map((variant) => {
                const cost = costs.get(variant.id);
                return (
                  <li key={variant.id}>
                    <Link
                      href={`/painel/fichas/${variant.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-sand-100"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                        {variant.name}
                      </span>
                      {cost ? (
                        cost.hasRecipe ? (
                          <span className="shrink-0 text-xs text-ink-muted" data-numeric>
                            custo {formatCents(cost.unitCostCents)} ·{' '}
                            <span
                              className={
                                cost.marginCents > 0 ? 'text-success-700' : 'text-danger-700'
                              }
                            >
                              {formatPercent(cost.marginPercent, 0)}
                            </span>
                          </span>
                        ) : (
                          <Badge tone="warning">Sem ficha</Badge>
                        )
                      ) : null}
                      <span className="shrink-0 text-sm text-ink" data-numeric>
                        {formatCents(variant.priceCents)}
                      </span>
                      <span className="shrink-0 text-sm text-clay-600">
                        {cost && !cost.hasRecipe ? 'Montar →' : 'Ver ficha →'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
