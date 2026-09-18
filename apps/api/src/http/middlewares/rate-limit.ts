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
