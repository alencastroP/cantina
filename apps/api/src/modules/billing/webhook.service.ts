import type { Transaction } from '@cantina/db';
import { tenants, withPlatform } from '@cantina/db';
import { eq } from 'drizzle-orm';

import { platformDb } from '../../db';
import { invoiceUrlFrom } from '../../integrations/asaas';
import { billingProvider, type BillingEvent } from '../../integrations/billing';
import { logger } from '../../shared/logger';
import * as repository from '../platform/platform.repository';
import { releasePendingSignup } from '../signup/signup.service';

/**
 * Webhook de cobrança (§6.11 do PLAN.md).
 *
 * A rota faz três coisas, nesta ordem, e a ordem é a garantia:
 *
 *   1. **verifica o segredo** — antes de qualquer parsing, para que payload
 *      malformado de terceiro nem chegue ao interpretador;
 *   2. **grava o evento** com `provider_event_id` único. O gateway reentrega
 *      até receber 200, e sem isso uma fatura seria baixada duas vezes;
 *   3. **processa**, e marca como processado só se der certo — um evento que
 *      falhou fica com `processed_at` nulo e pode ser reprocessado depois de
 *      corrigida a causa.
 *
 * A resposta é 200 mesmo quando o evento não tem efeito. Devolver erro para
 * um evento que não interessa faria o gateway reentregá-lo para sempre.
 */

export interface WebhookResult {
  received: boolean;
  duplicate: boolean;
  applied: boolean;
}

export async function handleAsaas(
  headers: Record<string, string | undefined>,
  payload: unknown,
): Promise<WebhookResult> {
  if (!billingProvider.verifyWebhook(headers)) {
    // Sem detalhe na resposta: dizer "token errado" para quem tenta adivinhar
    // confirma que a rota existe e que o formato do header está certo.
    throw Object.assign(new Error('Webhook não autorizado.'), { statusCode: 401 });
  }

  const event = billingProvider.parseWebhook(payload);

  return withPlatform(platformDb.db, async (tx) => {
    // Mesmo o evento sem efeito é gravado: é o que permite responder "o
    // gateway avisou?" meses depois, sem depender do log da aplicação.
    const record = await repository.recordWebhookEvent(tx, {
      provider: billingProvider.name,
      providerEventId:
        event?.providerEventId ?? `sem-id:${Date.now().toString(36)}`,
      type: event?.type ?? 'ignorado',
      payload: payload as Record<string, unknown>,
    });

    if (!record.isNew) {
      logger.info({ eventId: record.id }, 'Webhook repetido, ignorado');
      return { received: true, duplicate: true, applied: false };
    }

    if (!event) {
      await repository.markWebhookProcessed(tx, record.id);
      return { received: true, duplicate: false, applied: false };
    }

    try {
      await apply(tx, event, payload);
      await repository.markWebhookProcessed(tx, record.id);
      return { received: true, duplicate: false, applied: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await repository.markWebhookProcessed(tx, record.id, message);
      logger.error({ err: error, eventId: record.id }, 'Falha ao processar webhook');

      // 200 mesmo assim: o evento está gravado e reprocessável, e insistir
      // com o gateway não corrigiria a causa — só multiplicaria as tentativas.
      return { received: true, duplicate: false, applied: false };
    }
  });
}

/**
 * Efeito de cada evento.
 *
 * O status da EMPRESA e o da ASSINATURA mudam juntos, mas não são a mesma
 * coisa: a assinatura descreve a cobrança, a empresa descreve o acesso. Um
 * pagamento confirmado reativa as duas; um atraso muda a assinatura para
 * `past_due` e coloca a empresa em somente-leitura — nunca suspende de
 * imediato, porque quem está atrasado ainda pode pagar, e derrubar a loja
 * dele é o jeito mais rápido de garantir que não pague.
 */
async function apply(tx: Transaction, event: BillingEvent, payload: unknown): Promise<void> {
  if (event.type === 'checkout.completed' || event.type === 'subscription.created') {
    await applyCheckoutLifecycle(tx, event);
    return;
  }

  if (!event.providerSubscriptionId) {
    logger.warn({ type: event.type }, 'Evento sem assinatura, nada a aplicar');
    return;
  }

  const subscription = await repository.findSubscriptionByProviderId(
    tx,
    event.providerSubscriptionId,
  );

  if (!subscription) {
    // Acontece quando o banco falhou depois de o gateway criar a assinatura.
    // O erro é gravado no evento, que fica pendente para reconciliação.
    throw new Error(`Assinatura ${event.providerSubscriptionId} não encontrada.`);
  }

  if (event.providerInvoiceId) {
    await repository.upsertInvoice(tx, {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      providerInvoiceId: event.providerInvoiceId,
      amountCents: event.amountCents ?? 0,
      status: invoiceStatusFor(event.type),
      dueDate: event.occurredAt,
      paidAt: event.type === 'payment.confirmed' ? event.occurredAt : null,
      paymentUrl: invoiceUrlFrom(payload),
    });
  }

  switch (event.type) {
    case 'payment.confirmed': {
      // O período seguinte começa agora e vale um mês. É o ciclo do plano;
      // um pagamento adiantado não estende dois meses de uma vez.
      const periodEnd = new Date(event.occurredAt);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

      await repository.updateSubscription(tx, subscription.id, {
        status: 'active',
        currentPeriodStart: event.occurredAt,
        currentPeriodEnd: periodEnd,
      });

      await setTenantStatus(tx, subscription.tenantId, 'active');
      break;
    }

    case 'payment.overdue': {
      await repository.updateSubscription(tx, subscription.id, { status: 'past_due' });
      await setTenantStatus(tx, subscription.tenantId, 'past_due');
      break;
    }

    case 'payment.refunded': {
      await repository.updateSubscription(tx, subscription.id, { status: 'past_due' });
      await setTenantStatus(tx, subscription.tenantId, 'past_due');
      break;
    }

    case 'subscription.canceled': {
      await repository.updateSubscription(tx, subscription.id, {
        status: 'canceled',
        canceledAt: event.occurredAt,
      });
      // A empresa não é suspensa aqui: o período já pago continua valendo, e
      // é o job de cobrança que corta o acesso quando ele acabar.
      break;
    }
  }
}

/**
 * Checkout do teste grátis concluído, e a assinatura que ele gera.
 *
 * O Asaas manda os dois em eventos separados, sem ordem garantida:
 * `CHECKOUT_PAID` diz "o cartão foi validado" e traz o checkout (e o
 * cliente); `SUBSCRIPTION_CREATED` traz o id da assinatura, de que a
 * cobrança ao fim do teste e o cancelamento pelo painel dependem. Cada um
 * grava o que sabe, e qualquer um dos dois libera a conta — a liberação é
 * idempotente.
 *
 * Evento que não casa com nada é normal: `SUBSCRIPTION_CREATED` também chega
 * para assinaturas criadas pelo painel, que não nasceram de checkout.
 */
async function applyCheckoutLifecycle(tx: Transaction, event: BillingEvent): Promise<void> {
  const subscription = event.providerCheckoutId
    ? await repository.findSubscriptionByCheckoutId(tx, event.providerCheckoutId)
    : event.type === 'subscription.created' && event.providerCustomerId
      ? await repository.findUnlinkedSubscriptionByCustomer(tx, event.providerCustomerId)
      : null;

  if (!subscription) {
    logger.debug({ type: event.type }, 'Evento de checkout sem assinatura correspondente');
    return;
  }

  const link: Parameters<typeof repository.updateSubscription>[2] = {};
  if (event.providerCustomerId && !subscription.providerCustomerId) {
    link.providerCustomerId = event.providerCustomerId;
  }
  if (event.type === 'subscription.created' && event.providerSubscriptionId) {
    link.providerSubscriptionId = event.providerSubscriptionId;
  }
  if (Object.keys(link).length > 0) {
    await repository.updateSubscription(tx, subscription.id, link);
  }

  await releasePendingSignup(tx, subscription.tenantId);
}

function invoiceStatusFor(type: BillingEvent['type']) {
  switch (type) {
    case 'payment.confirmed':
      return 'paid' as const;
    case 'payment.overdue':
      return 'overdue' as const;
    case 'payment.refunded':
      return 'refunded' as const;
    default:
      return 'pending' as const;
  }
}

/**
 * Muda o status da empresa sem rebaixar quem já foi suspenso à mão.
 *
 * Um suporte que suspendeu uma loja por abuso não pode ver a suspensão
 * desfeita porque uma fatura antiga entrou. `suspended` e `canceled` só saem
 * pela mão de um administrador.
 */
async function setTenantStatus(
  tx: Transaction,
  tenantId: string,
  status: 'active' | 'past_due',
): Promise<void> {
  const [current] = await tx
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!current || current.status === 'suspended' || current.status === 'canceled') return;

  await tx.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
}
