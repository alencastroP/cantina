import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { orderRefsForLocking } = await import('./stock.service');

/**
 * Ordem de travamento.
 *
 * O modo de falhar disto só aparece sob concorrência: dois pedidos com os
 * mesmos itens em ordens opostas travam um o item do outro e o Postgres mata
 * uma das transações por deadlock. Por isso a ordem é testada aqui, e não
 * deixada para ser descoberta em produção numa sexta à noite.
 */
describe('ordem de travamento do estoque', () => {
  const farinha = { kind: 'supply' as const, refId: 'aaaa' };
  const frango = { kind: 'supply' as const, refId: 'bbbb' };
  const refri = { kind: 'product_variant' as const, refId: 'cccc' };

  it('produz a mesma ordem independentemente da ordem de entrada', () => {
    const um = orderRefsForLocking([farinha, frango, refri]);
    const outro = orderRefsForLocking([refri, frango, farinha]);
    assert.deepEqual(um, outro);
  });

  it('remove duplicatas — o mesmo item é travado uma vez só', () => {
    // Um pedido com duas linhas da mesma variação é comum: "2x coxinha" e
    // depois "+1 coxinha" com outra observação.
    const refs = orderRefsForLocking([refri, refri, farinha]);
    assert.equal(refs.length, 2);
  });

  it('agrupa por tipo antes do id, de forma estável', () => {
    const refs = orderRefsForLocking([refri, farinha, frango]);
    assert.deepEqual(
      refs.map((ref) => `${ref.kind}:${ref.refId}`),
      ['product_variant:cccc', 'supply:aaaa', 'supply:bbbb'],
    );
  });

  it('lida com lista vazia', () => {
    assert.deepEqual(orderRefsForLocking([]), []);
  });
});
