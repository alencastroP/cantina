import { AsyncLocalStorage } from 'node:async_hooks';

import type { PlatformRole, UserRole } from '@cantina/contracts';

import type { Logger } from './logger';

/**
 * Contexto da requisição.
 *
 * Existe para que log e auditoria não precisem receber `requestId`,
 * `tenantId` e `userId` como parâmetro em toda função. NÃO serve para
 * carregar a transação: essa é passada explicitamente pelo wrapper de rota,
 * porque um `tx` implícito é a maneira mais fácil de escrever fora do
 * contexto de tenant sem perceber.
 */

export interface RequestContext {
  requestId: string;
  tenantId: string | null;
  userId: string | null;
  /** Papel do painel OU da plataforma — o `scope` diz qual dos dois. */
  role: UserRole | PlatformRole | null;
  scope: 'tenant' | 'platform' | 'public';
  ip: string | null;
  logger: Logger;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Uso em código que só faz sentido dentro de uma requisição (auditoria). */
export function requireContext(): RequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error('Fora do contexto de requisição.');
  }
  return context;
}
