import { timingSafeEqual } from 'node:crypto';

import { env } from '../config/env';
import { logger } from '../shared/logger';
import type {
  BillingCustomer,
  BillingEvent,
  BillingEventType,
  BillingProvider,
  BillingSubscription,
  CreateCustomerInput,
  CreateRecurringCheckoutInput,
  CreateSubscriptionInput,
  RecurringCheckout,
} from './billing';
import { CHECKOUT_ITEM_IMAGE_BASE64 } from './checkout-image';

/**
 * Adaptador do Asaas (P1, módulo 11).
 *
 * HTTP direto, sem SDK: a API é REST simples e uma dependência a menos numa
 * imagem de produção é uma dependência a menos para atualizar — a mesma
 * escolha feita no Resend.
 *
 * O tipo `BillingProvider` é a fronteira. Nada fora deste arquivo sabe que o
 * Asaas chama fatura de "payment", que o valor vem em reais decimais, ou que
 * o status de assinatura é `ACTIVE` em maiúsculas. Trocar por Mercado Pago é
 * escrever outro arquivo como este.
 */

const TIMEOUT_MS = 15_000;

interface AsaasError {
  errors?: Array<{ code: string; description: string }>;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      access_token: env.ASAAS_API_KEY ?? '',
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // A mensagem do Asaas é útil e não contém segredo — vale propagar para o
    // log, mas não para o lojista, que receberá o texto do `AppError`.
    const description =
      (body as AsaasError | null)?.errors?.[0]?.description ?? `HTTP ${response.status}`;
    throw new Error(`Asaas: ${description}`);
  }

  return body as T;
}

/** O Asaas trabalha em reais decimais; o sistema inteiro, em centavos. */
function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

function toCents(value: unknown): number | null {
  return typeof value === 'number' ? Math.round(value * 100) : null;
}

const CYCLE = 'MONTHLY';

interface AsaasCustomerResponse {
  id: string;
}

interface AsaasSubscriptionResponse {
  id: string;
  status?: string;
  nextDueDate?: string;
}

interface AsaasCheckoutResponse {
  id: string;
  link?: string;
}

/**
 * Validade do link de checkout: o máximo que o Asaas aceita (24h). É também
 * o prazo do job que apaga cadastro nunca confirmado, então um checkout
 * vencido e um tenant pendente saem de cena juntos.
 */
const CHECKOUT_MINUTES_TO_EXPIRE = 1440;

/** O Asaas limita o nome do item a 30 caracteres. */
const ITEM_NAME_MAX = 30;

function mapSubscriptionStatus(status: string | undefined): BillingSubscription['status'] {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'OVERDUE':
    case 'INACTIVE':
      return 'past_due';
    default:
      return 'canceled';
  }
}

/**
 * Eventos que mudam o estado da assinatura.
 *
 * A lista é curta de propósito: o Asaas emite dezenas de eventos, e reagir a
 * um que não se entende é pior do que ignorá-lo. O que não está aqui volta
 * `null` e é gravado como recebido sem efeito — auditável, sem consequência.
 */
const EVENT_MAP: Record<string, BillingEventType> = {
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_RECEIVED: 'payment.confirmed',
  PAYMENT_OVERDUE: 'payment.overdue',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_DELETED: 'payment.refunded',
  SUBSCRIPTION_DELETED: 'subscription.canceled',
  // Teste grátis: checkout concluído = cartão validado, sem cobrança. A
  // assinatura que ele gera chega em seguida, em evento próprio.
  CHECKOUT_PAID: 'checkout.completed',
  SUBSCRIPTION_CREATED: 'subscription.created',
};

interface AsaasWebhookPayload {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: {
    id?: string;
    subscription?: string;
    value?: number;
    dateCreated?: string;
    invoiceUrl?: string;
  };
  subscription?: { id?: string; customer?: string; checkoutSession?: string };
  checkout?: { id?: string; customer?: string };
}

export const asaasProvider: BillingProvider = {
  name: 'asaas',

  async createCustomer(input: CreateCustomerInput): Promise<BillingCustomer> {
    const created = await call<AsaasCustomerResponse>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        cpfCnpj: input.document,
        ...(input.phone ? { mobilePhone: input.phone } : {}),
        // Amarra o cliente do gateway à empresa daqui. É por este campo que
        // se reconcilia à mão quando um webhook chega órfão.
        externalReference: input.tenantId,
      }),
    });

    return { providerCustomerId: created.id };
  },

  async createSubscription(input: CreateSubscriptionInput): Promise<BillingSubscription> {
    const created = await call<AsaasSubscriptionResponse>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.providerCustomerId,
        billingType: input.billingType,
        cycle: CYCLE,
        value: toReais(input.amountCents),
        nextDueDate: input.nextDueDate,
        description: `Cantina — plano ${input.planCode}`,
        externalReference: input.planCode,
      }),
    });

    return {
      providerSubscriptionId: created.id,
      status: mapSubscriptionStatus(created.status ?? 'ACTIVE'),
      currentPeriodEnd: created.nextDueDate ? new Date(`${created.nextDueDate}T00:00:00Z`) : null,
    };
  },

  /**
   * Checkout recorrente, só cartão.
   *
   * Cartão e não Pix porque o que se quer é um cartão guardado que o Asaas
   * cobra sozinho quando o teste acabar — Pix exigiria a pessoa voltar para
   * pagar. O cliente do gateway é criado pelo próprio checkout a partir de
   * `customerData` (a API não aceita um cliente já existente aqui).
   */
  async createRecurringCheckout(input: CreateRecurringCheckoutInput): Promise<RecurringCheckout> {
    const created = await call<AsaasCheckoutResponse>('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
        externalReference: input.externalReference,
        callback: {
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          expiredUrl: input.expiredUrl,
        },
        items: [
          {
            name: `Cantina ${input.planName}`.slice(0, ITEM_NAME_MAX),
            description: 'Assinatura mensal. Nada é cobrado durante o teste grátis.',
            imageBase64: CHECKOUT_ITEM_IMAGE_BASE64,
            quantity: 1,
            value: toReais(input.amountCents),
          },
        ],
        customerData: {
          name: input.customer.name,
          cpfCnpj: input.customer.document,
          email: input.customer.email,
          phone: input.customer.phone,
        },
        subscription: {
          cycle: CYCLE,
          nextDueDate: input.firstChargeDate,
        },
      }),
    });

    return { providerCheckoutId: created.id, checkoutUrl: created.link ?? null };
  },

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    await call(`/subscriptions/${providerSubscriptionId}`, { method: 'DELETE' });
  },

  /**
   * O Asaas autentica o webhook por um token estático em header próprio.
   *
   * Comparação em tempo constante: a diferença de latência entre um token que
   * erra no primeiro caractere e um que erra no último é medível, e é assim
   * que se adivinha um segredo byte a byte.
   */
  verifyWebhook(headers: Record<string, string | undefined>): boolean {
    const expected = env.ASAAS_WEBHOOK_TOKEN;
    if (!expected) return false;

    const received = headers['asaas-access-token'] ?? headers['asaas-access-token'.toLowerCase()];
    if (!received) return false;

    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  },

  parseWebhook(payload: unknown): BillingEvent | null {
    const body = payload as AsaasWebhookPayload | null;
    if (!body?.event) return null;

    const type = EVENT_MAP[body.event];
    if (!type) {
      logger.debug({ event: body.event }, 'Evento do Asaas sem efeito, apenas registrado');
      return null;
    }

    const occurred = body.payment?.dateCreated ?? body.dateCreated;
    const subjectId =
      body.payment?.id ?? body.checkout?.id ?? body.subscription?.id ?? 'sem-referencia';

    return {
      // O Asaas manda `id` do evento nas versões novas. Sem ele, a combinação
      // evento + objeto afetado é estável o bastante para a idempotência.
      providerEventId: body.id ?? `${body.event}:${subjectId}`,
      type,
      providerSubscriptionId: body.payment?.subscription ?? body.subscription?.id ?? null,
      providerInvoiceId: body.payment?.id ?? null,
      providerCheckoutId: body.checkout?.id ?? body.subscription?.checkoutSession ?? null,
      providerCustomerId: body.checkout?.customer ?? body.subscription?.customer ?? null,
      amountCents: toCents(body.payment?.value),
      occurredAt: occurred ? new Date(occurred) : new Date(),
    };
  },
};

/** Detalhes da fatura que só o adaptador sabe extrair do payload. */
export function invoiceUrlFrom(payload: unknown): string | null {
  return (payload as AsaasWebhookPayload | null)?.payment?.invoiceUrl ?? null;
}
