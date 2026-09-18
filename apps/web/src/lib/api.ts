import type { ErrorEnvelope } from '@cantina/contracts';

/**
 * Cliente da API.
 *
 * Dois caminhos, conforme D16:
 *
 *   `serverFetch`  usado pela VITRINE, no servidor. Repassa o host original
 *                  em `X-Tenant-Host` — é assim que a API sabe de qual loja é
 *                  a requisição sem que o browser participe.
 *
 *   `api.*`        usado pelo PAINEL, no browser, com Bearer token. É o mesmo
 *                  contrato que o app mobile futuro vai consumir (§9).
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3333';

export const API_URL = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, envelope: ErrorEnvelope['error']) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.details = envelope.details;
  }

  /** Erros de validação vêm com `fields` — é o que o formulário consome. */
  get fieldErrors(): Record<string, string> {
    const fields = this.details?.['fields'];
    if (!fields || typeof fields !== 'object') return {};

    const output: Record<string, string> = {};
    for (const [field, messages] of Object.entries(fields as Record<string, string[]>)) {
      if (messages[0]) output[field] = messages[0];
    }
    return output;
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (body as ErrorEnvelope | null)?.error;
    throw new ApiError(
      response.status,
      envelope ?? { code: 'unknown_error', message: 'Não foi possível concluir a ação.' },
    );
  }

  return body as T;
}

/* -------------------------------------------------------------------------- */
/* Sessão do painel                                                            */
/* -------------------------------------------------------------------------- */

/**
 * O access token vive em MEMÓRIA, nunca em `localStorage`.
 *
 * Qualquer script na página leria o `localStorage`; um módulo fechado, não. O
 * custo é perder a sessão ao recarregar — resolvido trocando o cookie de
 * refresh (`httpOnly`) por um token novo no boot do app.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Renovação com voo único.
 *
 * Sem isto, cinco requisições que expiram juntas disparam cinco refreshes — e
 * como o refresh ROTACIONA o token (módulo 1), quatro deles usariam um token
 * já rotacionado. O backend trata isso como reuso e derruba a sessão inteira,
 * por segurança. Compartilhar a mesma promessa evita provocar isso.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return false;

      const body = (await response.json()) as { accessToken: string };
      setAccessToken(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export interface RequestOptions {
  body?: unknown;
  /** Obrigatória em criação de pedido (invariante 6). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Interno: impede laço infinito de renovação. */
  retryOnUnauthorized?: boolean;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    ...(options.signal ? { signal: options.signal } : {}),
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  // Token venceu no meio do uso: renova uma vez e refaz a chamada. Sem isso,
  // o lojista seria deslogado a cada 15 minutos no meio do expediente.
  if (response.status === 401 && (options.retryOnUnauthorized ?? true)) {
    if (await refreshSession()) {
      return request<T>(method, path, { ...options, retryOnUnauthorized: false });
    }
    setAccessToken(null);
  }

  return parse<T>(response);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
  refresh: refreshSession,
};

/** Gera a chave de idempotência de uma criação de pedido. */
export function newIdempotencyKey(): string {
  return `web-${crypto.randomUUID()}`;
}

/* -------------------------------------------------------------------------- */
/* Vitrine — chamadas do BROWSER                                               */
/* -------------------------------------------------------------------------- */

/**
 * A vitrine é renderizada no servidor, mas o checkout acontece no browser: o
 * carrinho vive lá, e mandá-lo de volta ao servidor só para reenviar seria um
 * salto a mais no momento mais frágil do fluxo.
 *
 * O `X-Tenant-Host` identifica a loja — o mesmo header que o servidor do Next
 * usa. Sem autenticação: quem compra não tem conta (D4).
 */
export async function storefrontFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    tenantHost: string;
    idempotencyKey?: string;
  },
): Promise<T> {
  const response = await fetch(`${API_URL}/storefront${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Host': options.tenantHost,
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  return parse<T>(response);
}

/* -------------------------------------------------------------------------- */
/* Vitrine — renderizada no servidor                                           */
/* -------------------------------------------------------------------------- */

export interface ServerFetchOptions extends RequestInit {
  /** Host da vitrine, vindo do segmento de rota criado pelo middleware. */
  tenantHost: string;
  /** Segundos de cache. `0` desliga — use em dado que muda com o estoque. */
  revalidate?: number;
  tags?: string[];
}

export async function serverFetch<T>(
  path: string,
  { tenantHost, revalidate, tags, headers, ...init }: ServerFetchOptions,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Host': tenantHost,
      ...headers,
    },
    next: {
      ...(revalidate === undefined ? {} : { revalidate }),
      ...(tags ? { tags } : {}),
    },
  });

  return parse<T>(response);
}
