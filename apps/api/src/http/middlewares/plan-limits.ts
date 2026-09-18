import type { RequestHandler } from 'express';

import { withTenant } from '@cantina/db';
import { appDb } from '../../db';
import { currentUsage, planLimit, type LimitKind } from '../../modules/billing/billing.service';
import { AppError } from '../errors/app-error';

/**
 * Limite de plano (módulo 11).
 *
 * Aplicado só na CRIAÇÃO. Um lojista que baixou de plano e ficou acima do
 * limite continua enxergando e editando tudo que já tem — apagar produto do
 * cliente por causa de mudança de plano seria destruir dado dele por decisão
 * comercial nossa. Ele simplesmente não cria mais até caber.
 *
 * A leitura do limite custa uma consulta à conexão de plataforma, por isso é
 * um middleware por rota e não uma verificação global: só as três rotas que
 * criam algo contável pagam esse preço.
 */

/**
 * `ordersThisMonth` NÃO é aplicado como bloqueio em lugar nenhum.
 *
 * O pedido chega pela vitrine, feito por um cliente que não tem relação
 * comercial conosco. Recusá-lo porque o lojista precisa fazer upgrade tira
 * faturamento dele para pressionar a nós — o incentivo errado, e um jeito
 * rápido de perder o assinante em vez de convertê-lo. O número é contado e
 * mostrado na tela de assinatura; a conversa acontece ali.
 */
const MESSAGES: Record<LimitKind, string> = {
  products: 'Seu plano permite até {limit} produtos. Faça upgrade para cadastrar mais.',
  users: 'Seu plano permite até {limit} usuários. Faça upgrade para convidar mais gente.',
  ordersThisMonth:
    'Seu plano permite até {limit} pedidos por mês. Faça upgrade para continuar vendendo.',
};

export function enforcePlanLimit(kind: LimitKind): RequestHandler {
  return async (req, _res, next) => {
    try {
      const tenantId = req.auth?.tenantId ?? req.tenant?.id;
      if (!tenantId) {
        next();
        return;
      }

      const limit = await planLimit(tenantId, kind);
      // Sem plano ou sem limite declarado: nada a checar. `undefined` é
      // "ilimitado", nunca zero — tratá-lo como zero trancaria o cliente
      // para fora da própria conta.
      if (limit === null) {
        next();
        return;
      }

      const usage = await withTenant(appDb.db, tenantId, (tx) => currentUsage(tx));

      if (usage[kind] >= limit) {
        throw new AppError(
          402,
          'plan_limit_reached',
          MESSAGES[kind].replace('{limit}', String(limit)),
          { details: { limit, current: usage[kind], kind } },
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
