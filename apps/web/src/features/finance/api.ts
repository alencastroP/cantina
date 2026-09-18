import type {
  Cashflow,
  CreateAccountRequest,
  CreateEntryRequest,
  CreateFinanceCategoryRequest,
  CreateRecurrenceRequest,
  FinanceAccount,
  FinanceCategory,
  FinanceDirection,
  FinanceEntry,
  FinanceEntryStatus,
  FinanceRecurrence,
  Page,
  SettleEntryRequest,
  UpdateEntryRequest,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/**
 * Financeiro (§6.9 do PLAN.md).
 *
 * Nenhuma conta acontece aqui. Margem, saldo e ticket vêm calculados do
 * servidor — é o mesmo motivo pelo qual o custo do pedido não é recalculado
 * na tela: dois lugares fazendo a mesma conta é como duas margens diferentes
 * aparecem na mesma página.
 */
export const financeApi = {
  listEntries: (query: string) => api.get<Page<FinanceEntry>>(`/finance/entries${query}`),

  createEntry: (body: CreateEntryRequest) =>
    api.post<FinanceEntry>('/finance/entries', body),

  updateEntry: (id: string, body: UpdateEntryRequest) =>
    api.patch<FinanceEntry>(`/finance/entries/${id}`, body),

  settleEntry: (id: string, body: SettleEntryRequest) =>
    api.post<FinanceEntry>(`/finance/entries/${id}/settle`, body),

  removeEntry: (id: string) => api.delete<void>(`/finance/entries/${id}`),

  listAccounts: () => api.get<FinanceAccount[]>('/finance/accounts'),

  createAccount: (body: CreateAccountRequest) =>
    api.post<FinanceAccount>('/finance/accounts', body),

  listCategories: () => api.get<FinanceCategory[]>('/finance/categories'),

  createCategory: (body: CreateFinanceCategoryRequest) =>
    api.post<FinanceCategory>('/finance/categories', body),

  listRecurrences: () => api.get<FinanceRecurrence[]>('/finance/recurrences'),

  createRecurrence: (body: CreateRecurrenceRequest) =>
    api.post<FinanceRecurrence>('/finance/recurrences', body),

  removeRecurrence: (id: string) => api.delete<void>(`/finance/recurrences/${id}`),

  cashflow: (from: string, to: string) =>
    api.get<Cashflow>(`/finance/cashflow?from=${from}&to=${to}`),
};

/* -------------------------------------------------------------------------- */
/* Rótulos                                                                     */
/* -------------------------------------------------------------------------- */

export const DIRECTION_LABELS: Record<FinanceDirection, string> = {
  in: 'Entrada',
  out: 'Saída',
};

export const STATUS_LABELS: Record<FinanceEntryStatus, string> = {
  open: 'Em aberto',
  paid: 'Pago',
  overdue: 'Vencido',
  canceled: 'Cancelado',
};

export const STATUS_TONES: Record<FinanceEntryStatus, 'neutral' | 'success' | 'danger'> = {
  open: 'neutral',
  paid: 'success',
  overdue: 'danger',
  canceled: 'neutral',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Toda semana',
  biweekly: 'A cada 15 dias',
  monthly: 'Todo mês',
  bimonthly: 'A cada 2 meses',
  quarterly: 'A cada 3 meses',
  semiannual: 'A cada 6 meses',
  yearly: 'Todo ano',
};

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  bank: 'Conta bancária',
  wallet: 'Carteira digital',
};

/**
 * De onde veio o lançamento.
 *
 * Importa na tela porque lançamento automático não é editável: ele espelha um
 * documento, e mudá-lo aqui faria o financeiro discordar da origem sem deixar
 * rastro de qual dos dois está certo.
 */
export const SOURCE_LABELS: Record<string, string> = {
  delivery_order: 'Pedido',
  preorder: 'Encomenda',
  supply_purchase: 'Compra de insumo',
  subscription: 'Assinatura',
  manual: 'Manual',
};

export function isAutomatic(source: string): boolean {
  return source !== 'manual';
}
