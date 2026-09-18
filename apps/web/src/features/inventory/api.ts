import type {
  CreateAdjustmentRequest,
  CreateLossRequest,
  CreatePurchaseRequest,
  CreateSupplierRequest,
  CreateSupplyRequest,
  Page,
  StockBalance,
  StockMovement,
  Supplier,
  Supply,
  SupplyPurchase,
  UpdateSupplierRequest,
  UpdateSupplyRequest,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/** Estoque, insumos, fornecedores e compras (§6.5 do PLAN.md). */
export const inventoryApi = {
  listStock: (query: string) => api.get<Page<StockBalance>>(`/stock${query}`),

  listMovements: (query: string) => api.get<Page<StockMovement>>(`/stock/movements${query}`),

  adjust: (body: CreateAdjustmentRequest) =>
    api.post<{ qtyOnHand: number; qtyReserved: number }>('/stock/adjustments', body),

  registerLoss: (body: CreateLossRequest) =>
    api.post<{ qtyOnHand: number; qtyReserved: number }>('/stock/losses', body),

  listSupplies: (query: string) => api.get<Page<Supply>>(`/supplies${query}`),
  getSupply: (id: string) => api.get<Supply>(`/supplies/${id}`),
  createSupply: (body: CreateSupplyRequest) => api.post<Supply>('/supplies', body),
  updateSupply: (id: string, body: UpdateSupplyRequest) =>
    api.patch<Supply>(`/supplies/${id}`, body),
  removeSupply: (id: string) => api.delete<void>(`/supplies/${id}`),

  listSuppliers: () => api.get<Page<Supplier>>('/suppliers?limit=100'),
  createSupplier: (body: CreateSupplierRequest) => api.post<Supplier>('/suppliers', body),
  updateSupplier: (id: string, body: UpdateSupplierRequest) =>
    api.patch<Supplier>(`/suppliers/${id}`, body),
  removeSupplier: (id: string) => api.delete<void>(`/suppliers/${id}`),

  listPurchases: (query: string) => api.get<Page<SupplyPurchase>>(`/supply-purchases${query}`),
  createPurchase: (body: CreatePurchaseRequest) =>
    api.post<SupplyPurchase>('/supply-purchases', body),
};

export const USAGE_UNIT_LABELS: Record<string, string> = {
  g: 'gramas',
  ml: 'mililitros',
  un: 'unidades',
};

export const PURCHASE_UNIT_LABELS: Record<string, string> = {
  kg: 'quilo (kg)',
  g: 'grama (g)',
  l: 'litro (L)',
  ml: 'mililitro (ml)',
  un: 'unidade',
  cx: 'caixa',
  pct: 'pacote',
  sc: 'saco',
  fd: 'fardo',
};

/**
 * Unidades de compra que NÃO têm conversão física conhecida.
 *
 * Comprar em caixa ou pacote exige que o lojista diga quanto vem dentro; kg→g
 * e L→ml o servidor preenche sozinho. A tela usa esta lista para mostrar o
 * campo só quando ele é necessário.
 */
export const PACKAGED_UNITS = new Set(['cx', 'pct', 'sc', 'fd']);

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase: 'Compra',
  production_in: 'Produção',
  production_out: 'Consumo em produção',
  reservation: 'Reserva',
  reservation_release: 'Reserva liberada',
  sale: 'Venda',
  adjustment: 'Ajuste',
  loss: 'Perda',
  return: 'Devolução',
};

/** Movimentos que aumentam o saldo — usados para colorir o extrato. */
export const INBOUND_MOVEMENTS = new Set(['purchase', 'production_in', 'return']);
