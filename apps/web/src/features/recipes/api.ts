import type {
  CostSummary,
  CreateProductionRequest,
  CreateSalesChannelRequest,
  Page,
  ProductCosting,
  ProductionResult,
  PutRecipeRequest,
  Recipe,
  SalesChannel,
  SimulateRequest,
  SimulateResponse,
  UpdateSalesChannelRequest,
  VariantAvailability,
  VariantCost,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/** Fichas técnicas, canais e precificação (§6.6 do PLAN.md). */
export const recipesApi = {
  getRecipe: (variantId: string) => api.get<Recipe>(`/variants/${variantId}/recipe`),

  putRecipe: (variantId: string, body: PutRecipeRequest) =>
    api.put<Recipe>(`/variants/${variantId}/recipe`, body),

  removeRecipe: (variantId: string) => api.delete<void>(`/variants/${variantId}/recipe`),

  getCost: (variantId: string) => api.get<VariantCost>(`/variants/${variantId}/cost`),

  /** Receita e custo de todas as variações do produto, numa chamada. */
  getProductCosting: (productId: string) =>
    api.get<ProductCosting>(`/products/${productId}/costing`),

  costSummary: (variantIds: string[]) =>
    api.get<CostSummary>(`/pricing/summary?variantIds=${variantIds.join(',')}`),

  getAvailability: (variantId: string) =>
    api.get<VariantAvailability>(`/variants/${variantId}/availability`),

  simulate: (body: SimulateRequest) => api.post<SimulateResponse>('/pricing/simulate', body),

  listChannels: () => api.get<Page<SalesChannel>>('/sales-channels'),

  createChannel: (body: CreateSalesChannelRequest) =>
    api.post<SalesChannel>('/sales-channels', body),

  updateChannel: (id: string, body: UpdateSalesChannelRequest) =>
    api.patch<SalesChannel>(`/sales-channels/${id}`, body),

  removeChannel: (id: string) => api.delete<void>(`/sales-channels/${id}`),

  produce: (body: CreateProductionRequest) =>
    api.post<ProductionResult>('/stock/production', body),
};

/**
 * Copia a ficha de uma variação para outra.
 *
 * Copia a RECEITA (insumos, quantidades, perda, rendimento), não o custo: o
 * custo é recalculado pelo servidor a partir do custo médio de hoje, como em
 * qualquer ficha. É o "puxar a receita" de um produto parecido — o bolo de
 * cenoura G nasce da ficha do M, e só as quantidades mudam.
 */
export async function copyRecipe(fromVariantId: string, toVariantId: string) {
  const source = await recipesApi.getRecipe(fromVariantId);
  return recipesApi.putRecipe(toVariantId, {
    yieldQty: source.yieldQty,
    notes: source.notes,
    items: source.items.map((item) => ({
      supplyId: item.supplyId,
      qty: item.qty,
      wastePercent: item.wastePercent,
    })),
  });
}

export const CHANNEL_KIND_LABELS: Record<string, string> = {
  own_storefront: 'Vitrine própria',
  marketplace: 'Marketplace',
  counter: 'Balcão',
};
