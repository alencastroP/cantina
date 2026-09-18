import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canSeeCosts, stripSensitive } from './cost-visibility';

describe('visibilidade de custo', () => {
  it('corta custo e margem em qualquer profundidade, preservando o resto', () => {
    const body = {
      id: 'p1',
      totalCents: 1_000,
      costCents: 400,
      items: [{ unitPriceCents: 500, unitCostCents: 200, qty: 2 }],
      supply: { name: 'Farinha', avgUnitCost: 0.4, qtyOnHand: 5_000 },
    };

    assert.deepEqual(stripSensitive(body), {
      id: 'p1',
      totalCents: 1_000,
      items: [{ unitPriceCents: 500, qty: 2 }],
      supply: { name: 'Farinha', qtyOnHand: 5_000 },
    });
  });

  it('não muta a resposta original', () => {
    const body = { costCents: 10 };
    stripSensitive(body);
    assert.equal(body.costCents, 10);
  });

  it('deixa intactos valores que não são objeto simples', () => {
    const date = new Date('2026-09-10T12:00:00Z');
    assert.equal(stripSensitive(date), date);
    assert.equal(stripSensitive(null), null);
    assert.equal(stripSensitive('costCents'), 'costCents');
    assert.deepEqual(stripSensitive([1, { marginCents: 3, name: 'x' }]), [1, { name: 'x' }]);
  });

  it('só gestão e financeiro enxergam custo', () => {
    assert.equal(canSeeCosts('owner'), true);
    assert.equal(canSeeCosts('manager'), true);
    assert.equal(canSeeCosts('finance'), true);
    assert.equal(canSeeCosts('staff'), false);
    assert.equal(canSeeCosts(undefined), false);
  });
});
