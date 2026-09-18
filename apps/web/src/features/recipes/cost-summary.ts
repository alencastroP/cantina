'use client';

import type {
  CostSummary,
  Page as ApiPage,
  Product,
  VariantCostSummary,
} from '@cantina/contracts';
import { useMemo } from 'react';

import { useApi } from '../../lib/use-api';

/** O teto do contrato: além disso a lista precisa de busca, não de mais ids. */
const MAX_IDS = 200;

/**
 * Tem ficha? Quanto custa? Quanto sobra? — de várias variações de uma vez.
 *
 * Uma requisição para a lista inteira, em vez de uma por variação. `enabled`
 * existe porque só gestão lê custo: para os outros papéis a busca nem sai,
 * em vez de sair e voltar 403.
 */
export function useCostSummary(
  variantIds: string[],
  enabled: boolean,
): Map<string, VariantCostSummary> {
  const key = enabled ? variantIds.slice(0, MAX_IDS).join(',') : '';
  const summary = useApi<CostSummary>(key ? `/pricing/summary?variantIds=${key}` : null);

  return useMemo(
    () => new Map((summary.data?.items ?? []).map((item) => [item.variantId, item])),
    [summary.data],
  );
}

export interface RecipeSource {
  variantId: string;
  label: string;
  unitCostCents: number;
  hasUnknownCost: boolean;
}

/**
 * Variações que já têm ficha — de onde dá para "puxar" uma receita.
 *
 * Cada opção já vem com o custo de hoje, calculado no servidor: escolher de
 * onde copiar é também escolher quanto o produto novo vai custar.
 */
export function useRecipeSources(enabled: boolean, excludeVariantId?: string) {
  const products = useApi<ApiPage<Product>>(enabled ? '/products?limit=100' : null);

  const variants = useMemo(
    () =>
      (products.data?.items ?? []).flatMap((product) =>
        product.variants.map((variant) => ({ product, variant })),
      ),
    [products.data],
  );

  const summary = useCostSummary(
    variants.map(({ variant }) => variant.id),
    enabled,
  );

  const sources = useMemo<RecipeSource[]>(
    () =>
      variants
        .filter(
          ({ variant }) =>
            variant.id !== excludeVariantId && summary.get(variant.id)?.hasRecipe === true,
        )
        .map(({ product, variant }) => {
          const cost = summary.get(variant.id)!;
          return {
            variantId: variant.id,
            label:
              variant.name && variant.name !== 'Padrão'
                ? `${product.name} (${variant.name})`
                : product.name,
            unitCostCents: cost.unitCostCents,
            hasUnknownCost: cost.hasUnknownCost,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [variants, summary, excludeVariantId],
  );

  return {
    sources,
    loading: products.loading || (variants.length > 0 && summary.size === 0 && enabled),
    error: products.error,
  };
}
