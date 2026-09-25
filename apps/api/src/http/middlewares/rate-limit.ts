import rateLimit, { type Options } from 'express-rate-limit';

import { isProduction } from '../../config/env';
import { tooManyRequests } from '../errors/app-error';

/**
 * Limites por IP.
 *
 * A vitrine é pública e sem login (D4), então o IP é o único identificador
 * disponível. Os três limites abaixo têm alvos diferentes:
 *
 *   storefront  navegação do cardápio — generoso, é leitura cacheável
 *   auth        login e reset — apertado, é a superfície de força bruta
 *   write       criação de pedido — freia flood de pedido falso, que além de
 *               poluir o kanban SEGURA ESTOQUE por reserva (D14)
 */

const base: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Sem limite em desenvolvimento: bater no teto testando à mão é só ruído.
  skip: () => !isProduction,
  handler: (_req, _res, next) => {
    next(tooManyRequests());
  },
};

export const storefrontLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 120,
});

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 10,
  // Conta apenas tentativas malsucedidas: quem acerta a senha não é freado.
  skipSuccessfulRequests: true,
});

export const writeLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
});

/**
 * Cadastro público do teste grátis (SIGNUP-TESTE-GRATIS.md §3.3).
 *
 * Ao contrário de `authLimiter`, aqui o que interessa limitar é o SUCESSO:
 * criar contas é o objetivo do abuso, não um efeito colateral dele. Três por
 * IP por hora é baixo de propósito — duas docerias legítimas no mesmo IP na
 * mesma hora é caso raro, e quem cair no limite fala com o suporte.
 */
export const signupLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 3,
  skipFailedRequests: true,
});
