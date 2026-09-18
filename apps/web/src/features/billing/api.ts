import type {
  BillingOverview,
  StartSubscriptionRequest,
  Subscription,
  SubscriptionStatus,
  TenantStatus,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/**
 * Assinatura do lojista (§6.11 do PLAN.md, módulo 11).
 *
 * Só `owner` acessa — quem contrata e cancela é quem paga.
 */

/** A resposta traz um campo a mais que o contrato: se há gateway configurado. */
export type BillingOverviewResponse = BillingOverview & { simulated: boolean };

export const billingApi = {
  overview: () => api.get<BillingOverviewResponse>('/subscription'),

  start: (body: StartSubscriptionRequest) =>
    api.post<Subscription>('/subscription', body),

  // O motivo vai no corpo de um DELETE: é incomum, mas cancelar sem registrar
  // por quê deixa a conversa de retenção sem nenhuma informação.
  cancel: (reason: string) => api.delete<void>('/subscription', { body: { reason } }),
};

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  trial: 'Período de teste',
  active: 'Assinatura ativa',
  past_due: 'Pagamento em atraso',
  suspended: 'Loja suspensa',
  canceled: 'Assinatura cancelada',
};

export const TENANT_STATUS_TONES: Record<
  TenantStatus,
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  trial: 'warning',
  active: 'success',
  past_due: 'warning',
  suspended: 'danger',
  canceled: 'danger',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Em atraso',
  canceled: 'Cancelada',
  expired: 'Expirada',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando pagamento',
  paid: 'Paga',
  overdue: 'Vencida',
  canceled: 'Cancelada',
  refunded: 'Estornada',
};

export const BILLING_TYPE_LABELS: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
};

/**
 * Quanto do limite já foi usado, em 0-100.
 *
 * Limite ausente é SEM limite, e devolve `null` — a barra some em vez de
 * mostrar 0%, que faria um plano ilimitado parecer o mais apertado de todos.
 */
export function usageRatio(used: number, limit: number | undefined): number | null {
  if (!limit) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Dias inteiros até uma data ISO. Negativo quando já passou. */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}
