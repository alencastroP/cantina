import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatOrderMessage, toWhatsAppNumber } from './whatsapp';

describe('link do WhatsApp', () => {
  it('acrescenta o DDI quando falta', () => {
    assert.equal(toWhatsAppNumber('(11) 98765-4321'), '5511987654321');
  });

  it('não duplica o DDI quando já existe', () => {
    assert.equal(toWhatsAppNumber('+55 11 98765-4321'), '5511987654321');
  });
});

describe('mensagem do pedido', () => {
  const base = {
    storeName: 'Padaria do Zé',
    customerName: 'Maria',
    items: [
      { qty: 2, productName: 'Coxinha', variantName: 'Unidade', totalCents: 1400 },
      { qty: 1, productName: 'Refrigerante', totalCents: 600, notes: 'bem gelado' },
    ],
    subtotalCents: 2000,
    deliveryFeeCents: 500,
    totalCents: 2500,
    fulfillment: 'delivery' as const,
    address: 'Rua das Acácias, 120',
  };

  it('põe o código do pedido no topo quando ele foi gravado', () => {
    const message = formatOrderMessage({ ...base, orderCode: 42 });
    assert.ok(message.startsWith('*Pedido #42*'));
  });

  it('sem código, anuncia como pedido novo (modo link_only)', () => {
    const message = formatOrderMessage(base);
    assert.ok(message.startsWith('*Novo pedido*'));
  });

  it('formata valores em reais e traz a observação do item', () => {
    const message = formatOrderMessage(base);
    assert.ok(message.includes('2x Coxinha (Unidade)'));
    assert.ok(message.includes('obs: bem gelado'));
    assert.ok(message.includes('Entrega: R$'));
    assert.ok(message.includes('Rua das Acácias, 120'));
  });

  it('omite a taxa de entrega na retirada', () => {
    const message = formatOrderMessage({
      ...base,
      fulfillment: 'pickup',
      deliveryFeeCents: 0,
    });
    assert.ok(message.includes('Retirada no local'));
    assert.ok(!message.includes('Entrega:'));
  });
});
