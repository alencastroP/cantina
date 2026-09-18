import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { composeSummary, marginPercent } = await import('./reports.service');

const range = { from: '2026-03-01', to: '2026-03-31' };

const sales = {
  revenueCents: 500_000,
  costCents: 200_000,
  ordersCount: 40,
  deliveryCount: 30,
  preorderCount: 10,
  receivableCents: 45_000,
};

/**
 * O erro que este arquivo existe para impedir.
 *
 * Um mês em que o lojista repõe estoque parece prejuízo se a compra de insumo
 * entrar no resultado — a farinha seria contada uma vez ao ser comprada e
 * outra ao sair no produto vendido. O relatório mostra o desembolso, mas ele
 * não desconta do resultado.
 */
describe('resumo do período', () => {
  it('não desconta compra de insumo do resultado', () => {
    const magro = composeSummary(range, sales, 2, {
      operatingCents: 100_000,
      supplyPurchasesCents: 0,
    });
    const reposicao = composeSummary(range, sales, 2, {
      operatingCents: 100_000,
      supplyPurchasesCents: 300_000,
    });

    assert.equal(magro.resultCents, reposicao.resultCents);
    assert.equal(reposicao.supplyPurchasesCents, 300_000);
  });

  it('resultado é margem bruta menos despesa operacional', () => {
    const result = composeSummary(range, sales, 0, {
      operatingCents: 100_000,
      supplyPurchasesCents: 0,
    });

    assert.equal(result.costOfGoodsCents, 200_000);
    assert.equal(result.grossMarginCents, 300_000);
    assert.equal(result.resultCents, 200_000);
  });

  it('ticket médio é receita sobre pedidos, arredondado ao centavo', () => {
    const result = composeSummary(range, { ...sales, revenueCents: 10_001, ordersCount: 3 }, 0, {
      operatingCents: 0,
      supplyPurchasesCents: 0,
    });

    assert.equal(result.avgTicketCents, 3334);
  });

  it('período sem venda não divide por zero', () => {
    const vazio = composeSummary(
      range,
      {
        revenueCents: 0,
        costCents: 0,
        ordersCount: 0,
        deliveryCount: 0,
        preorderCount: 0,
        receivableCents: 0,
      },
      0,
      { operatingCents: 80_000, supplyPurchasesCents: 0 },
    );

    assert.equal(vazio.avgTicketCents, 0);
    assert.equal(vazio.grossMarginPercent, 0);
    // Mês sem faturamento e com aluguel pago é prejuízo, não zero.
    assert.equal(vazio.resultCents, -80_000);
  });

  it('conta cancelados à parte do faturamento', () => {
    const result = composeSummary(range, sales, 7, {
      operatingCents: 0,
      supplyPurchasesCents: 0,
    });

    assert.equal(result.canceledCount, 7);
    assert.equal(result.ordersCount, 40);
  });
});

describe('margem percentual', () => {
  it('arredonda para uma casa', () => {
    assert.equal(marginPercent(3000, 1000), 66.7);
  });

  it('é zero sem receita, mesmo com custo', () => {
    // Produção que virou perda não vira margem negativa infinita.
    assert.equal(marginPercent(0, 5000), 0);
  });

  it('fica negativa quando o custo passa o preço', () => {
    assert.equal(marginPercent(1000, 1500), -50);
  });
});
