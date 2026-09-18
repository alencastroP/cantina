import type {
  CostsReport,
  ProductsReport,
  ReportSummary,
  SalesGroupBy,
  SalesReport,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/**
 * Relatórios (§6.9 do PLAN.md, módulo 10).
 *
 * O intervalo é sempre explícito nas duas pontas. Um relatório que assume
 * "este mês" no servidor e "últimos 30 dias" na tela é como dois números
 * verdadeiros passam a se contradizer.
 */
export const reportsApi = {
  summary: (range: Range) => api.get<ReportSummary>(`/reports/summary${qs(range)}`),

  sales: (range: Range, groupBy: SalesGroupBy) =>
    api.get<SalesReport>(`/reports/sales${qs(range)}&groupBy=${groupBy}`),

  products: (range: Range, orderBy: ProductsOrderBy, limit = 10) =>
    api.get<ProductsReport>(`/reports/products${qs(range)}&orderBy=${orderBy}&limit=${limit}`),

  costs: (range: Range) => api.get<CostsReport>(`/reports/costs${qs(range)}`),
};

export type ProductsOrderBy = 'revenue' | 'qty' | 'margin';

export interface Range {
  from: string;
  to: string;
}

function qs(range: Range): string {
  return `?from=${range.from}&to=${range.to}`;
}

/** Caminho para o `useApi`, que recebe a URL pronta em vez de um cliente. */
export const reportPath = {
  summary: (range: Range) => `/reports/summary${qs(range)}`,
  sales: (range: Range, groupBy: SalesGroupBy) =>
    `/reports/sales${qs(range)}&groupBy=${groupBy}`,
  products: (range: Range, orderBy: ProductsOrderBy, limit = 10) =>
    `/reports/products${qs(range)}&orderBy=${orderBy}&limit=${limit}`,
  costs: (range: Range) => `/reports/costs${qs(range)}`,
};

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Hoje no fuso da loja.
 *
 * O relógio do navegador é o do CLIENTE: um lojista viajando, ou um celular
 * com fuso errado, pediria o relatório de outro dia. O servidor corta o
 * período pelo fuso da empresa, e a tela precisa concordar com ele.
 *
 * O fuso ainda não vem no `/auth/me`; até vir, América/São_Paulo é o padrão
 * do cadastro de empresa e vale para todo assinante atual.
 */
export const STORE_TIME_ZONE = 'America/Sao_Paulo';

export function todayInStore(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Primeiro e último dia do mês de `date` — o último não passa de hoje. */
export function monthRange(date: string): Range {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const first = `${date.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const value = new Date(Date.UTC(year, index - 1 + delta, 1));
  return value.toISOString().slice(0, 7);
}

const monthFormat = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatMonth(month: string): string {
  const label = monthFormat.format(new Date(`${month}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const dayFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** `2026-03-12` vira `12/03`. Rótulo de eixo, não de documento. */
export function formatDayShort(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}
