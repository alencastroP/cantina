import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);
process.env.ASAAS_WEBHOOK_TOKEN = 'segredo-de-teste';

const { asaasProvider } = await import('../../integrations/asaas');
const { shouldSuspend } = await import('./billing.jobs');

/**
 * O webhook é a superfície mais exposta do módulo: qualquer um na internet
 * pode chamá-la, e o que ela faz é mudar o status de pagamento de um cliente.
 * As duas garantias que precisam valer sempre estão aqui.
 */
describe('verificação do webhook', () => {
  it('aceita o token correto', () => {
    assert.equal(
      asaasProvider.verifyWebhook({ 'asaas-access-token': 'segredo-de-teste' }),
      true,
    );
  });

  it('recusa token errado', () => {
    assert.equal(asaasProvider.verifyWebhook({ 'asaas-access-token': 'outro' }), false);
  });

  it('recusa token ausente', () => {
    assert.equal(asaasProvider.verifyWebhook({}), false);
  });

  it('recusa token de tamanho diferente sem estourar', () => {
    // `timingSafeEqual` lança quando os buffers têm tamanhos diferentes —
    // a comparação de comprimento antes dela não é otimização, é o que
    // impede um 500 a cada requisição malformada.
    assert.equal(asaasProvider.verifyWebhook({ 'asaas-access-token': 'x' }), false);
  });
});

describe('leitura do evento do Asaas', () => {
  const base = {
    id: 'evt_001',
    event: 'PAYMENT_CONFIRMED',
    payment: {
      id: 'pay_001',
      subscription: 'sub_001',
      value: 99.9,
      dateCreated: '2026-03-12',
      invoiceUrl: 'https://asaas.test/i/pay_001',
    },
  };

  it('traduz o evento e converte o valor para centavos', () => {
    const event = asaasProvider.parseWebhook(base);

    assert.equal(event?.type, 'payment.confirmed');
    assert.equal(event?.providerSubscriptionId, 'sub_001');
    assert.equal(event?.providerInvoiceId, 'pay_001');
    // 99,90 vira 9990 — e não 9989,999… que é o que um `* 100` sem
    // arredondar produz para vários valores em ponto flutuante.
    assert.equal(event?.amountCents, 9990);
  });

  it('mapeia recebido e confirmado para o mesmo efeito', () => {
    const received = asaasProvider.parseWebhook({ ...base, event: 'PAYMENT_RECEIVED' });
    assert.equal(received?.type, 'payment.confirmed');
  });

  it('devolve nulo para evento sem efeito', () => {
    // Ignorar é diferente de falhar: um evento desconhecido é registrado e
    // respondido com 200, senão o gateway o reentrega para sempre.
    assert.equal(asaasProvider.parseWebhook({ ...base, event: 'PAYMENT_UPDATED' }), null);
    assert.equal(asaasProvider.parseWebhook({}), null);
  });

  it('inventa uma chave estável quando o evento não traz id', () => {
    const { id: _id, ...semId } = base;
    const event = asaasProvider.parseWebhook(semId);

    // A chave precisa ser DETERMINÍSTICA: é ela que a idempotência usa, e
    // uma chave aleatória faria a mesma reentrega virar um evento novo.
    assert.equal(event?.providerEventId, 'PAYMENT_CONFIRMED:pay_001');
    assert.equal(
      asaasProvider.parseWebhook(semId)?.providerEventId,
      event?.providerEventId,
    );
  });

  it('lê o checkout concluído do teste grátis', () => {
    const event = asaasProvider.parseWebhook({
      id: 'evt_003',
      event: 'CHECKOUT_PAID',
      checkout: { id: 'chk_001', customer: 'cus_001' },
    });

    assert.equal(event?.type, 'checkout.completed');
    assert.equal(event?.providerCheckoutId, 'chk_001');
    assert.equal(event?.providerCustomerId, 'cus_001');
    assert.equal(event?.providerSubscriptionId, null);
  });

  it('liga a assinatura criada ao checkout que a gerou', () => {
    const event = asaasProvider.parseWebhook({
      id: 'evt_004',
      event: 'SUBSCRIPTION_CREATED',
      subscription: { id: 'sub_009', customer: 'cus_001', checkoutSession: 'chk_001' },
    });

    assert.equal(event?.type, 'subscription.created');
    assert.equal(event?.providerSubscriptionId, 'sub_009');
    assert.equal(event?.providerCheckoutId, 'chk_001');
    assert.equal(event?.providerCustomerId, 'cus_001');
  });

  it('não confunde checkouts diferentes quando o evento vem sem id', () => {
    const a = asaasProvider.parseWebhook({ event: 'CHECKOUT_PAID', checkout: { id: 'chk_a' } });
    const b = asaasProvider.parseWebhook({ event: 'CHECKOUT_PAID', checkout: { id: 'chk_b' } });
    assert.notEqual(a?.providerEventId, b?.providerEventId);
  });

  it('aceita evento de assinatura sem pagamento', () => {
    const event = asaasProvider.parseWebhook({
      id: 'evt_002',
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: 'sub_001' },
    });

    assert.equal(event?.type, 'subscription.canceled');
    assert.equal(event?.providerSubscriptionId, 'sub_001');
    assert.equal(event?.amountCents, null);
  });
});

/**
 * A escada de cobrança.
 *
 * Suspender uma loja tira a vitrine do ar e custa faturamento ao cliente —
 * é a consequência que precisa acontecer no dia certo, nem antes nem nunca.
 */
describe('prazo para suspender por atraso', () => {
  const now = new Date('2026-03-30T12:00:00Z');

  it('não suspende no primeiro dia de atraso', () => {
    assert.equal(shouldSuspend(new Date('2026-03-29T12:00:00Z'), now), false);
  });

  it('não suspende no décimo quarto dia', () => {
    assert.equal(shouldSuspend(new Date('2026-03-16T12:00:00Z'), now), false);
  });

  it('suspende depois do décimo quinto', () => {
    assert.equal(shouldSuspend(new Date('2026-03-14T12:00:00Z'), now), true);
  });

  it('a janela é configurável', () => {
    assert.equal(shouldSuspend(new Date('2026-03-25T12:00:00Z'), now, 3), true);
  });
});
