import { startSubscriptionRequestSchema } from '@cantina/contracts';
import { Router } from 'express';
import { z } from 'zod';

import { requireOwner } from '../../http/middlewares/auth';
import { openRoute, tenantRoute } from '../../http/route';
import { billingIsSimulated } from '../../integrations/billing';
import { unauthorized } from '../../http/errors/app-error';
import * as service from './billing.service';
import { handleAsaas } from './webhook.service';

/**
 * Assinatura do lojista (§6.11 do PLAN.md).
 *
 * Só `owner`. Não é hierarquia por hierarquia: quem contrata e cancela é
 * quem paga, e um gerente com acesso a isto poderia derrubar a loja inteira
 * sem que o dono soubesse.
 *
 * Nenhuma rota usa `requireActiveTenant` — é justamente a tela que uma
 * empresa em atraso precisa conseguir abrir para voltar a pagar.
 */
export const subscriptionRouter: Router = Router();

subscriptionRouter.use(requireOwner);

subscriptionRouter.get(
  '/',
  tenantRoute({
    handler: async ({ tx, tenantId }) => ({
      ...(await service.overview(tx, tenantId)),
      // A tela precisa saber que não há gateway configurado; sem isso ela
      // anunciaria "assinatura ativa" para uma cobrança que nunca existiu.
      simulated: billingIsSimulated,
    }),
  }),
);

subscriptionRouter.post(
  '/',
  tenantRoute({
    body: startSubscriptionRequestSchema,
    status: 201,
    handler: ({ tx, tenantId, body, user }) =>
      service.start(tx, tenantId, body, user!.id),
  }),
);

subscriptionRouter.delete(
  '/',
  tenantRoute({
    body: z.object({ reason: z.string().trim().min(3).max(300) }),
    status: 204,
    handler: async ({ tenantId, body }) => {
      await service.cancel(tenantId, body.reason);
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Webhook                                                                     */
/* -------------------------------------------------------------------------- */

export const billingWebhookRouter: Router = Router();

/**
 * `openRoute`: o webhook não tem tenant nem sessão.
 *
 * O serviço abre a própria transação de plataforma — a rota só entrega
 * cabeçalhos e corpo. É a mesma razão de não usar `tenantRoute`: não existe
 * tenant no contexto até o evento ser casado com uma assinatura.
 */
billingWebhookRouter.post(
  '/asaas',
  openRoute({
    handler: async ({ req }) => {
      try {
        return await handleAsaas(
          req.headers as Record<string, string | undefined>,
          req.body,
        );
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 401) {
          throw unauthorized('Webhook não autorizado.');
        }
        throw error;
      }
    },
  }),
);
