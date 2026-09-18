import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { nextDueDate } = await import('./finance.service');

/**
 * Avanço de vencimento das recorrências.
 *
 * O caso que quebra implementações ingênuas é o dia 31: somar um mês a
 * 31 de janeiro transborda para março no `Date`, e o aluguel do dia 31
 * passaria a vencer no dia 3 — silenciosamente, e para sempre, porque o
 * próximo cálculo parte da data errada.
 */
describe('próximo vencimento de recorrência', () => {
  it('avança um mês no caso simples', () => {
    assert.equal(nextDueDate('2026-03-05', 'monthly'), '2026-04-05');
  });

  it('não transborda 31 de janeiro para março', () => {
    assert.equal(nextDueDate('2026-01-31', 'monthly'), '2026-02-28');
  });

  it('respeita fevereiro bissexto', () => {
    assert.equal(nextDueDate('2028-01-31', 'monthly'), '2028-02-29');
  });

  it('volta ao dia 31 quando o mês tem', () => {
    // O vencimento seguinte parte de 28/02, então o dia 31 não volta sozinho.
    // É o comportamento do boleto: uma vez ajustado, segue ajustado.
    assert.equal(nextDueDate('2026-02-28', 'monthly'), '2026-03-28');
  });

  it('vira o ano', () => {
    assert.equal(nextDueDate('2026-12-10', 'monthly'), '2027-01-10');
  });

  it('avança trimestre e semestre em meses, não em dias', () => {
    assert.equal(nextDueDate('2026-01-15', 'quarterly'), '2026-04-15');
    assert.equal(nextDueDate('2026-01-15', 'semiannual'), '2026-07-15');
    assert.equal(nextDueDate('2026-01-15', 'yearly'), '2027-01-15');
  });

  it('semanal e quinzenal avançam em dias', () => {
    assert.equal(nextDueDate('2026-03-05', 'weekly'), '2026-03-12');
    assert.equal(nextDueDate('2026-03-05', 'biweekly'), '2026-03-19');
  });

  it('atravessa o fim do mês no semanal', () => {
    assert.equal(nextDueDate('2026-01-28', 'weekly'), '2026-02-04');
  });
});
