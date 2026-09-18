'use client';

import type {
  ChangeTenantStatusRequest,
  CreatePlanRequest,
  CreateTenantRequest,
  ErrorEnvelope,
  Page,
  Plan,
  PlatformMetrics,
  PlatformSession,
  PlatformSubscription,
  PlatformTenant,
  UpdatePlanRequest,
  UpdateTenantRequest,
} from '@cantina/contracts';

import { API_URL, ApiError } from '../../lib/api';

/**
 * Cliente da administração da plataforma (D5).
 *
 * Cliente SEPARADO do painel, não uma opção do outro. Os dois guardam token
 * em lugares diferentes, e misturá-los abriria a possibilidade de uma tela do
 * lojista mandar, por engano, o token de plataforma — que enxerga todos os
 * assinantes.
 *
 * A sessão vive em `sessionStorage`, não em cookie: ela morre quando a aba
 * fecha, e não acompanha o administrador para outras abas nem sobrevive ao
 * fim do expediente. Não há renovação — token expirado devolve 401 e a tela
 * pede a senha de novo. Para uma ferramenta interna usada algumas vezes por
 * semana, é o compromisso certo: a fricção é pequena e a janela de exposição
 * de um token com esse poder fica curta.
 */

const STORAGE_KEY = 'cantina.platform.session';

export interface AdminSession {
  accessToken: string;
  user: PlatformSession['user'];
}

export function readSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    // Aba anônima com storage bloqueado: sem sessão persistida, e a tela
    // simplesmente pede login de novo. Não é motivo para quebrar a página.
    return null;
  }
}

export function writeSession(session: AdminSession | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Sem storage a sessão vale só para esta navegação. */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const session = readSession();

  const response = await fetch(`${API_URL}/platform${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 401) {
    // Token vencido ou inválido: a sessão é descartada aqui mesmo, para que a
    // próxima navegação já caia na tela de login em vez de acumular 401.
    writeSession(null);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (payload as ErrorEnvelope | null)?.error;
    throw new ApiError(
      response.status,
      envelope ?? { code: 'unknown_error', message: 'Não foi possível concluir a ação.' },
    );
  }

  return payload as T;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<PlatformSession>('POST', '/auth/login', { email, password }),

  metrics: () => request<PlatformMetrics>('GET', '/metrics'),

  listTenants: (query: string) => request<Page<PlatformTenant>>('GET', `/tenants${query}`),
  getTenant: (id: string) => request<PlatformTenant>('GET', `/tenants/${id}`),
  createTenant: (body: CreateTenantRequest) =>
    request<PlatformTenant>('POST', '/tenants', body),
  updateTenant: (id: string, body: UpdateTenantRequest) =>
    request<PlatformTenant>('PATCH', `/tenants/${id}`, body),
  changeStatus: (id: string, body: ChangeTenantStatusRequest) =>
    request<PlatformTenant>('POST', `/tenants/${id}/status`, body),

  listPlans: () => request<Plan[]>('GET', '/plans'),
  createPlan: (body: CreatePlanRequest) => request<Plan>('POST', '/plans', body),
  updatePlan: (id: string, body: UpdatePlanRequest) =>
    request<Plan>('PATCH', `/plans/${id}`, body),

  listSubscriptions: (query: string) =>
    request<Page<PlatformSubscription>>('GET', `/subscriptions${query}`),
};
