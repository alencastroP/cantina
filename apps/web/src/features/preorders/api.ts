import type {
  AvailabilityException,
  AvailabilityRule,
  Calendar,
  CancelOrderRequest,
  CreateExceptionRequest,
  CreatePreorderRequest,
  DayAvailability,
  Preorder,
  PreorderBoard,
  PreorderDetail,
  RegisterDepositRequest,
  UpdatePreorderRequest,
} from '@cantina/contracts';
import { allowedPreorderTransitions, type PreorderStatus } from '@cantina/domain';

import { api, newIdempotencyKey } from '../../lib/api';

/**
 * Encomendas e agenda (§6.8 do PLAN.md).
 *
 * Como no kanban de delivery, as transições vêm de `@cantina/domain` — o
 * mesmo módulo que o servidor usa para validar.
 */
export const preordersApi = {
  board: () => api.get<PreorderBoard>('/preorders/board'),

  calendar: (month: string) => api.get<Calendar>(`/preorders/calendar?month=${month}`),

  get: (id: string) => api.get<PreorderDetail>(`/preorders/${id}`),

  create: (body: CreatePreorderRequest) =>
    api.post<PreorderDetail>('/preorders', body, { idempotencyKey: newIdempotencyKey() }),

  update: (id: string, body: UpdatePreorderRequest) =>
    api.patch<PreorderDetail>(`/preorders/${id}`, body),

  changeStatus: (id: string, status: Exclude<PreorderStatus, 'canceled'>) =>
    api.patch<PreorderDetail>(`/preorders/${id}/status`, { status }),

  cancel: (id: string, body: CancelOrderRequest) =>
    api.post<PreorderDetail>(`/preorders/${id}/cancel`, body),

  registerDeposit: (id: string, body: RegisterDepositRequest) =>
    api.post<PreorderDetail>(`/preorders/${id}/deposit`, body),

  /* --- Agenda --- */

  getRules: () => api.get<AvailabilityRule[]>('/availability/rules'),

  putRules: (rules: AvailabilityRule[]) =>
    api.put<AvailabilityRule[]>('/availability/rules', { rules }),

  listExceptions: (from: string, to: string) =>
    api.get<AvailabilityException[]>(`/availability/exceptions?from=${from}&to=${to}`),

  upsertException: (body: CreateExceptionRequest) =>
    api.post<AvailabilityException>('/availability/exceptions', body),

  removeException: (id: string) => api.delete<void>(`/availability/exceptions/${id}`),

  days: (from: string, to: string) =>
    api.get<DayAvailability[]>(`/availability/days?from=${from}&to=${to}`),
};

/** Próximo passo do fluxo — o botão de um toque no cartão. */
export function nextPreorderStatus(
  preorder: Preorder,
): Exclude<PreorderStatus, 'canceled'> | null {
  const allowed = allowedPreorderTransitions(preorder.status).filter(
    (status): status is Exclude<PreorderStatus, 'canceled'> => status !== 'canceled',
  );
  return allowed[0] ?? null;
}

export const PREORDER_ACTION_LABELS: Record<string, string> = {
  confirmed: 'Confirmar',
  in_production: 'Iniciar produção',
  ready: 'Marcar como pronta',
  completed: 'Entregar',
};

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** `AAAA-MM` do mês atual, no fuso de São Paulo. */
export function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}
