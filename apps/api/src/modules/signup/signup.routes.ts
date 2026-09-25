import { trialSignupRequestSchema } from '@cantina/contracts';
import { Router } from 'express';

import { getIdempotencyKey, requireIdempotencyKey } from '../../http/middlewares/idempotency';
import { signupLimiter } from '../../http/middlewares/rate-limit';
import { platformRoute } from '../../http/route';
import * as service from './signup.service';

/**
 * Cadastro público do teste grátis (SIGNUP-TESTE-GRATIS.md).
 *
 * Pública, anônima, sem tenant no contexto — usa `platformRoute` do mesmo
 * jeito que o login de plataforma usa (`anonymous: true`): a transação corre
 * na conexão com BYPASSRLS, porque criar tenant+usuário+domínio exige
 * escrever em tabelas que ainda não têm dono nenhum.
 *
 * Sem `requireAuth` nem `requirePlatformAuth`: ninguém autentica antes de
 * ter conta. A defesa aqui é `signupLimiter` (que conta SUCESSO, não
 * tentativa) e `requireIdempotencyKey` — nunca sessão ou cookie (§3.6).
 */
export const signupRouter: Router = Router();

signupRouter.post(
  '/trial',
  signupLimiter,
  requireIdempotencyKey,
  platformRoute({
    anonymous: true,
    body: trialSignupRequestSchema,
    status: 201,
    handler: ({ tx, body, req }) => service.startTrial(tx, body, getIdempotencyKey(req)!),
  }),
);
