import { env, isProduction } from '../config/env';
import { logger } from '../shared/logger';
import { asaasProvider } from './asaas';

/**
 * Assinatura SaaS (D17, P1).
 *
 * A porta define o contrato; `asaas.ts` é o adaptador real. `subscriptions` e
 * `subscription_invoices` guardam `provider_*` desde a primeira migration, e
 * o formato desses campos vem daqui — foi por isso que a interface nasceu
 * antes da implementação.
 */

export interface BillingCustomer {
  providerCustomerId: string;
}

export interface CreateCustomerInput {
  tenantId: string;
  name: string;
  email: string;
  /** CPF ou CNPJ, só dígitos. O Asaas exige. */
  document: string;
  phone?: string;
}

export interface CreateSubscriptionInput {
  providerCustomerId: string;
  planCode: string;
  amountCents: number;
  /**
   * `PIX` ou `BOLETO` no Asaas; cartão exige tokenização à parte.
   * `UNDEFINED`: quem paga escolhe na própria página do provedor — é o que
   * o cadastro público usa, porque não coleta cartão (D-cadastro-trial).
   */
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
  nextDueDate: string;
}

export interface BillingSubscription {
  providerSubscriptionId: string;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date | null;
  /**
   * Link da PRIMEIRA fatura, hospedado pelo provedor — nulo quando o
   * gateway ainda não gerou nenhuma (só existe se `nextDueDate` for hoje).
   * É o que o cadastro público devolve como `checkoutUrl`; a assinatura do
   * painel (`billing.service.ts`) nunca lê este campo.
   */
  checkoutUrl: string | null;
}

export type BillingEventType =
  | 'payment.confirmed'
  | 'payment.overdue'
  | 'payment.refunded'
  | 'subscription.canceled';

export interface BillingEvent {
  /** Chave de idempotência do webhook — vira `webhook_events.provider_event_id`. */
  providerEventId: string;
  type: BillingEventType;
  providerSubscriptionId: string | null;
  providerInvoiceId: string | null;
  amountCents: number | null;
  occurredAt: Date;
}

export interface BillingProvider {
  readonly name: string;
  createCustomer(input: CreateCustomerInput): Promise<BillingCustomer>;
  createSubscription(input: CreateSubscriptionInput): Promise<BillingSubscription>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  /** Valida o segredo do webhook antes de qualquer parsing. */
  verifyWebhook(headers: Record<string, string | undefined>): boolean;
  parseWebhook(payload: unknown): BillingEvent | null;
}

/**
 * Adaptador local, sem gateway.
 *
 * Existe pelo mesmo motivo do adaptador de console do e-mail: sem conta em
 * provedor nenhum, o fluxo inteiro de assinatura roda em desenvolvimento — o
 * lojista escolhe o plano, a assinatura é criada, o painel destrava.
 *
 * A recusa em produção é a parte que não pode faltar. Subir sem
 * `ASAAS_API_KEY` e continuar "ativando" assinaturas seria dar o produto de
 * graça em silêncio, que é o pior modo de falhar de um SaaS.
 */
const manualProvider: BillingProvider = {
  name: 'manual',

  async createCustomer(input) {
    logger.warn({ tenantId: input.tenantId }, 'Cobrança sem gateway: cliente local');
    return { providerCustomerId: `manual-cus-${input.tenantId}` };
  },

  async createSubscription(input) {
    const end = new Date();
    end.setUTCMonth(end.getUTCMonth() + 1);

    logger.warn(
      { planCode: input.planCode, amountCents: input.amountCents },
      'Cobrança sem gateway: assinatura ativada localmente',
    );

    return {
      providerSubscriptionId: `manual-sub-${Date.now().toString(36)}`,
      status: 'active',
      currentPeriodEnd: end,
      // Sem gateway não existe página de checkout nenhuma para linkar.
      checkoutUrl: null,
    };
  },

  async cancelSubscription() {
    // Não há nada para cancelar fora daqui: o estado local já é a verdade.
  },

  // Sem gateway não existe webhook legítimo — aceitar qualquer um seria abrir
  // uma rota que muda status de assinatura sem autenticação nenhuma.
  verifyWebhook: () => false,
  parseWebhook: () => null,
};

function resolveProvider(): BillingProvider {
  if (env.ASAAS_API_KEY) return asaasProvider;

  if (isProduction) {
    throw new Error(
      'ASAAS_API_KEY ausente em produção: a assinatura não pode rodar sem gateway.',
    );
  }

  logger.warn('Sem ASAAS_API_KEY: usando o adaptador local de cobrança.');
  return manualProvider;
}

export const billingProvider: BillingProvider = resolveProvider();

/** `true` quando não há gateway — a tela avisa em vez de fingir que cobrou. */
export const billingIsSimulated = billingProvider.name === 'manual';
