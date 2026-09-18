import type { Request, Response } from 'express';

import { env, isProduction } from '../../config/env';

/**
 * Cookie do refresh token.
 *
 * O valor é `<tenantId>.<token>`, e isso não é detalhe de formato: carregar
 * o tenant junto permite que `/auth/refresh` abra o contexto de RLS ANTES de
 * procurar o token. Sem ele, a busca por hash precisaria varrer a tabela com
 * a conexão de plataforma — ou seja, ler dado de tenant com BYPASSRLS num
 * caminho chamado a cada 15 minutos por usuário logado.
 *
 * O `tenantId` no cookie não é credencial: se for adulterado, o hash não bate
 * dentro daquele tenant e o refresh falha.
 */

export const REFRESH_COOKIE = 'cantina_refresh';

/**
 * Escopo do path: o cookie só é enviado às rotas de auth. Toda chamada de
 * API do painel deixa de carregar um token de longa duração à toa.
 */
const COOKIE_PATH = '/api/v1/auth';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    // Em produção, API e web estão em hosts diferentes (api.cantina.app vs
    // cantina.app), o que torna a requisição cross-site: `none` + `secure`
    // é o único par que o browser aceita. Em dev, tudo é localhost.
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    ...(isProduction ? { domain: `.${env.ROOT_DOMAIN}` } : {}),
    path: COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, tenantId: string, token: string): void {
  res.cookie(REFRESH_COOKIE, `${tenantId}.${token}`, cookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

/**
 * Lê o cookie direto do header.
 *
 * Um `cookie-parser` resolveria o mesmo, mas é uma dependência em produção
 * para ler UM cookie em três rotas.
 */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export interface RefreshCookieValue {
  tenantId: string;
  token: string;
}

export function readRefreshCookie(req: Request): RefreshCookieValue | null {
  const raw = readCookie(req, REFRESH_COOKIE);
  if (!raw) return null;

  const separator = raw.indexOf('.');
  if (separator <= 0) return null;

  const tenantId = raw.slice(0, separator);
  const token = raw.slice(separator + 1);
  if (!tenantId || !token) return null;

  return { tenantId, token };
}
