import type {
  Category,
  CreateCategoryRequest,
  CreateProductRequest,
  CreateVariantRequest,
  Page,
  Product,
  ProductDetail,
  UpdateAvailabilityRequest,
  UpdateCategoryRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  Variant,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/**
 * Chamadas do catálogo.
 *
 * Os tipos vêm de `@cantina/contracts` — nenhuma interface é redeclarada
 * aqui. Se o contrato mudar, o `tsc` do web acusa antes de qualquer tela
 * quebrar em produção.
 */
export const catalogApi = {
  listCategories: () => api.get<Category[]>('/categories'),

  createCategory: (body: CreateCategoryRequest) => api.post<Category>('/categories', body),

  updateCategory: (id: string, body: UpdateCategoryRequest) =>
    api.patch<Category>(`/categories/${id}`, body),

  removeCategory: (id: string) =>
    api.delete<{ detachedProducts: number }>(`/categories/${id}`),

  reorderCategories: (ids: string[]) =>
    api.patch<Category[]>('/categories/reorder', { ids }),

  listProducts: (query: string) => api.get<Page<Product>>(`/products${query}`),

  getProduct: (id: string) => api.get<ProductDetail>(`/products/${id}`),

  createProduct: (body: CreateProductRequest) => api.post<ProductDetail>('/products', body),

  updateProduct: (id: string, body: UpdateProductRequest) =>
    api.patch<ProductDetail>(`/products/${id}`, body),

  setAvailability: (id: string, body: UpdateAvailabilityRequest) =>
    api.patch<ProductDetail>(`/products/${id}/availability`, body),

  removeProduct: (id: string) => api.delete<void>(`/products/${id}`),

  createVariant: (productId: string, body: CreateVariantRequest) =>
    api.post<Variant>(`/products/${productId}/variants`, body),

  updateVariant: (id: string, body: UpdateVariantRequest) =>
    api.patch<Variant>(`/variants/${id}`, body),

  removeVariant: (id: string) => api.delete<void>(`/variants/${id}`),
};

/** "R$ 7,00" ou "R$ 7,00 – R$ 12,00" quando há mais de uma variação. */
export function priceRange(variants: Variant[]): { min: number; max: number } | null {
  const active = variants.filter((variant) => variant.active);
  if (active.length === 0) return null;

  const prices = active.map((variant) => variant.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export const STOCK_MODE_LABELS: Record<string, string> = {
  tracked: 'Conta unidades',
  on_demand: 'Sob demanda',
};

export const AVAILABLE_FOR_LABELS: Record<string, string> = {
  both: 'Delivery e encomenda',
  delivery: 'Só delivery',
  preorder: 'Só encomenda',
};
