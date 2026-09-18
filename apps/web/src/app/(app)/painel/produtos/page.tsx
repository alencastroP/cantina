'use client';

import type { Category, Page as ApiPage, Product, VariantCostSummary } from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useSession } from '../../../../components/auth-provider';
import { PageHeader } from '../../../../components/layout/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../components/ui/button';
import { EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { Alert } from '../../../../components/ui/feedback';
import { Input, Select } from '../../../../components/ui/field';
import { formatCents, formatPercent } from '../../../../lib/format';
import { canManageCosts } from '../../../../lib/roles';
import { useApi, useDebounced } from '../../../../lib/use-api';
import { priceRange, STOCK_MODE_LABELS } from '../../../../features/catalog/api';
import { useCostSummary } from '../../../../features/recipes/cost-summary';

/**
 * Lista de produtos.
 *
 * Cartões empilhados em vez de tabela: no celular, uma tabela de seis colunas
 * vira rolagem horizontal, e esta é uma tela que o lojista abre no balcão.
 */
export default function ProdutosPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [onlyActive, setOnlyActive] = useState('');

  const debouncedSearch = useDebounced(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (debouncedSearch.length >= 2) params.set('q', debouncedSearch);
    if (categoryId) params.set('categoryId', categoryId);
    if (onlyActive) params.set('active', onlyActive);
    return `?${params.toString()}`;
  }, [debouncedSearch, categoryId, onlyActive]);

  const products = useApi<ApiPage<Product>>(`/products${query}`);
  const categories = useApi<Category[]>('/categories');

  // Custo e margem da variação padrão de cada produto — só para gestão, numa
  // requisição só para a lista inteira.
  const { user } = useSession();
  const showCosts = canManageCosts(user?.role);
  const costs = useCostSummary(
    (products.data?.items ?? []).map(
      (product) => (product.variants.find((variant) => variant.isDefault) ?? product.variants[0])?.id ?? '',
    ).filter(Boolean),
    showCosts,
  );

  const hasFilters = Boolean(debouncedSearch || categoryId || onlyActive);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Produtos"
        description="O que aparece no cardápio da sua vitrine."
        action={
          <div className="flex gap-2">
            <LinkButton href="/painel/produtos/categorias" variant="secondary" size="sm">
              Categorias
            </LinkButton>
            <LinkButton href="/painel/produtos/novo" variant="primary" size="sm">
              Novo produto
            </LinkButton>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          type="search"
          placeholder="Buscar por nome…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar produtos"
        />
        <Select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {categories.data?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          value={onlyActive}
          onChange={(event) => setOnlyActive(event.target.value)}
          aria-label="Filtrar por situação"
        >
          <option value="">Ativos e inativos</option>
          <option value="true">Só ativos</option>
          <option value="false">Só inativos</option>
        </Select>
      </div>

      {products.error ? (
        <Alert tone="danger" title="Não foi possível carregar os produtos.">
          {products.error.message}
        </Alert>
      ) : null}

      {products.loading && !products.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[4.5rem]" />
          ))}
        </div>
      ) : null}

      {products.data && products.data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description="Tente outro termo ou limpe os filtros."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setCategoryId('');
                  setOnlyActive('');
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Seu cardápio está vazio"
            description="Cadastre o primeiro produto para ele aparecer na vitrine."
            action={
              <LinkButton href="/painel/produtos/novo" variant="primary">
                Cadastrar produto
              </LinkButton>
            }
          />
        )
      ) : null}

      <ul className="space-y-2">
        {products.data?.items.map((product) => {
          const variant =
            product.variants.find((item) => item.isDefault) ?? product.variants[0];
          return (
            <li key={product.id}>
              <ProductRow
                product={product}
                cost={showCosts && variant ? (costs.get(variant.id) ?? null) : undefined}
              />
            </li>
          );
        })}
      </ul>

      {products.data?.nextCursor ? (
        <p className="mt-4 text-center text-sm text-ink-muted">
          Mostrando os 50 mais recentes. Use a busca para encontrar os demais.
        </p>
      ) : null}
    </div>
  );
}

function ProductRow({
  product,
  cost,
}: {
  product: Product;
  /** `undefined` = papel sem acesso a custo; `null` = ainda carregando. */
  cost?: VariantCostSummary | null;
}) {
  const range = priceRange(product.variants);
  const paused = product.pausedUntil !== null && new Date(product.pausedUntil) > new Date();

  return (
    <Link
      href={`/painel/produtos/${product.id}`}
      className="flex items-center gap-4 rounded-card border border-border bg-surface px-4 py-3 shadow-soft transition-colors hover:border-border-strong hover:bg-sand-50"
    >
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt=""
          className="size-12 shrink-0 rounded-control object-cover"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-control bg-sand-200 text-sand-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink">{product.name}</p>
          {!product.active ? <Badge tone="neutral">Inativo</Badge> : null}
          {paused ? <Badge tone="warning">Pausado</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-muted">
          {product.categoryName ?? 'Sem categoria'}
          {' · '}
          {STOCK_MODE_LABELS[product.stockMode]}
          {product.variants.length > 1 ? ` · ${product.variants.length} variações` : ''}
        </p>
      </div>

      <div className="shrink-0 text-right" data-numeric>
        {range ? (
          <p className="font-medium text-ink">
            {range.min === range.max
              ? formatCents(range.min)
              : `${formatCents(range.min)} – ${formatCents(range.max)}`}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">sem preço</p>
        )}
        {cost ? (
          cost.hasRecipe ? (
            <p
              className={
                cost.marginCents > 0 ? 'text-xs text-ink-muted' : 'text-xs text-danger-700'
              }
              title="Custo da ficha técnica e margem no canal padrão"
            >
              custo {formatCents(cost.unitCostCents)} · {formatPercent(cost.marginPercent, 0)}
            </p>
          ) : (
            <p className="text-xs text-warning-700">sem ficha</p>
          )
        ) : null}
      </div>
    </Link>
  );
}
