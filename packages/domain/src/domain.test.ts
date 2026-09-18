import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeAvailability } from './availability';
import { channelMargin, priceForTargetMargin, purchaseUnitCost, recipeCost, weightedAverageUnitCost } from './cost';
import { DomainError } from './errors';
import { zonedEndOfDay, zonedStartOfDay } from './dates';
import { formatBRL, parseBRL } from './money';
import { assertDeliveryTransition, assertPreorderTransition } from './order-status';
import { applyMovement, availableUnits, maxProducibleUnits } from './stock';
import { assertConversionFactor } from './units';

describe('custo de insumo', () => {
  it('converte "comprei 5kg por R$50" em centavos por grama', () => {
    const unitCost = purchaseUnitCost({
      purchaseQty: 5,
      conversionFactor: 1000,
      totalCents: 5000,
    });
    assert.equal(unitCost, 1);
  });

  it('mantém precisão em insumo barato (sub-centavo por grama)', () => {
    const unitCost = purchaseUnitCost({
      purchaseQty: 25,
      conversionFactor: 1000,
      totalCents: 7500,
    });
    assert.equal(unitCost, 0.3);
  });

  it('pondera o custo médio pelo saldo existente', () => {
    const unitCost = weightedAverageUnitCost({
      currentQty: 1000,
      currentUnitCost: 1,
      incomingQty: 1000,
      incomingUnitCost: 2,
    });
    assert.equal(unitCost, 1.5);
  });

  it('ignora o saldo quando ele é zero, em vez de zerar o custo', () => {
    const unitCost = weightedAverageUnitCost({
      currentQty: 0,
      currentUnitCost: 0,
      incomingQty: 500,
      incomingUnitCost: 4,
    });
    assert.equal(unitCost, 4);
  });

  it('exige fator de conversão para unidade embalada', () => {
    assert.throws(() => assertConversionFactor('pct', 'g', null), DomainError);
    assert.equal(assertConversionFactor('pct', 'g', 500), 500);
  });

  it('usa a conversão física e ignora um fator divergente digitado', () => {
    assert.equal(assertConversionFactor('kg', 'g', 999), 1000);
  });
});

describe('ficha técnica', () => {
  const breakdown = recipeCost(
    [
      { supplyId: 'farinha', supplyName: 'Farinha', qty: 1000, wastePercent: 0, unitCost: 1 },
      { supplyId: 'acucar', supplyName: 'Açúcar', qty: 500, wastePercent: 10, unitCost: 0.5 },
    ],
    10,
  );

  it('divide o custo do lote pelo rendimento', () => {
    // 1000 × 1 + 550 × 0,5 = 1275 centavos no lote, 10 unidades
    assert.equal(breakdown.batchCostCents, 1275);
    assert.equal(breakdown.unitCostCents, 128);
  });

  it('embute a perda na quantidade efetiva', () => {
    const acucar = breakdown.lines.find((line) => line.supplyId === 'acucar');
    assert.equal(acucar?.effectiveQty, 550);
  });

  it('mostra a fatia de cada insumo no custo', () => {
    const total = breakdown.lines.reduce((sum, line) => sum + line.sharePercent, 0);
    assert.ok(Math.abs(total - 100) < 0.001);
  });
});

describe('margem por canal', () => {
  const ifood = {
    commissionPercent: 23,
    paymentFeePercent: 0,
    fixedFeeCents: 0,
    absorbsDeliveryFee: false,
  };

  it('desconta a comissão da receita', () => {
    const result = channelMargin({ priceCents: 5000, unitCostCents: 1500 }, ifood);
    assert.equal(result.channelFeesCents, 1150);
    assert.equal(result.netRevenueCents, 3850);
    assert.equal(result.marginCents, 2350);
  });

  it('desconta o frete quando o lojista o absorve', () => {
    const result = channelMargin(
      { priceCents: 5000, unitCostCents: 1500, deliveryFeeCents: 800 },
      { ...ifood, absorbsDeliveryFee: true },
    );
    assert.equal(result.deliveryCostCents, 800);
    assert.equal(result.netRevenueCents, 3050);
  });

  it('calcula o preço que atinge a margem-alvo', () => {
    const price = priceForTargetMargin(1500, 50, ifood);
    const check = channelMargin({ priceCents: price, unitCostCents: 1500 }, ifood);
    assert.ok(Math.abs(check.marginPercent - 50) < 0.05);
  });
});

describe('estoque', () => {
  it('reserva mexe no reservado, nunca no físico', () => {
    const next = applyMovement({ qtyOnHand: 10, qtyReserved: 0 }, 'reservation', 3);
    assert.deepEqual(next, { qtyOnHand: 10, qtyReserved: 3 });
  });

  it('venda converte reserva em saída sem contar duas vezes', () => {
    const next = applyMovement({ qtyOnHand: 10, qtyReserved: 3 }, 'sale', 3);
    assert.deepEqual(next, { qtyOnHand: 7, qtyReserved: 0 });
  });

  it('recusa saída que deixaria o físico negativo', () => {
    assert.throws(() => applyMovement({ qtyOnHand: 2, qtyReserved: 0 }, 'loss', 5), DomainError);
  });

  it('recusa liberar mais reserva do que existe', () => {
    assert.throws(
      () => applyMovement({ qtyOnHand: 10, qtyReserved: 1 }, 'reservation_release', 2),
      DomainError,
    );
  });

  it('permite ajuste manual negativo', () => {
    const next = applyMovement({ qtyOnHand: 2, qtyReserved: 0 }, 'adjustment', -2);
    assert.equal(next.qtyOnHand, 0);
  });

  it('deriva disponibilidade do insumo mais escasso', () => {
    const units = maxProducibleUnits([
      { supplyId: 'farinha', qtyPerUnit: 100, supplyAvailableQty: 1000 },
      { supplyId: 'ovo', qtyPerUnit: 1, supplyAvailableQty: 6 },
    ]);
    assert.equal(units, 6);
  });

  it('trata produto sem receita como disponível', () => {
    assert.equal(availableUnits({ stockMode: 'on_demand', requirements: [] }), Infinity);
  });
});

describe('transições de status', () => {
  it('confirmar dá baixa no estoque', () => {
    const effects = assertDeliveryTransition('pending', 'confirmed', 'delivery');
    assert.equal(effects.stock, 'commit');
  });

  it('cancelar antes de confirmar apenas libera a reserva', () => {
    const effects = assertDeliveryTransition('pending', 'canceled', 'delivery');
    assert.equal(effects.stock, 'release_reservation');
  });

  it('cancelar depois de confirmar devolve o estoque', () => {
    const effects = assertDeliveryTransition('preparing', 'canceled', 'delivery');
    assert.equal(effects.stock, 'restore');
  });

  it('retirada no balcão não passa por "saiu para entrega"', () => {
    assert.throws(
      () => assertDeliveryTransition('ready', 'out_for_delivery', 'pickup'),
      DomainError,
    );
    assert.doesNotThrow(() => assertDeliveryTransition('ready', 'completed', 'pickup'));
  });

  it('encomenda cancelada libera a vaga na agenda', () => {
    const effects = assertPreorderTransition('confirmed', 'canceled');
    assert.equal(effects.slot, 'release');
    assert.equal(effects.stock, 'restore');
  });

  it('status terminal não volta atrás', () => {
    assert.throws(() => assertDeliveryTransition('completed', 'preparing', 'delivery'), DomainError);
  });
});

describe('agenda de encomendas', () => {
  const now = new Date('2026-03-10T12:00:00-03:00'); // terça, 12h
  const base = {
    rules: [
      { weekday: 3, isOpen: true, capacity: 5 }, // quarta
      { weekday: 4, isOpen: true, capacity: 5 }, // quinta
      { weekday: 5, isOpen: true, capacity: 5 }, // sexta
    ],
    exceptions: [],
    counters: [],
    settings: { leadTimeHours: 48, horizonDays: 60, timeZone: 'America/Sao_Paulo' },
    now,
  };

  it('bloqueia data dentro da antecedência mínima', () => {
    const days = computeAvailability({ ...base, from: '2026-03-11', to: '2026-03-13' });
    assert.equal(days[0]?.reason, 'lead_time'); // quarta, só 24h à frente
    assert.equal(days[1]?.available, true); // quinta, 48h
  });

  it('bloqueia dia sem regra de funcionamento', () => {
    const days = computeAvailability({ ...base, from: '2026-03-14', to: '2026-03-14' });
    assert.equal(days[0]?.reason, 'closed');
  });

  it('conta reservas contra a capacidade', () => {
    const days = computeAvailability({
      ...base,
      from: '2026-03-12',
      to: '2026-03-12',
      counters: [{ date: '2026-03-12', usedCount: 3, reservedCount: 2 }],
    });
    assert.equal(days[0]?.slotsLeft, 0);
    assert.equal(days[0]?.reason, 'full');
  });

  it('exceção fecha um dia que a regra abriria', () => {
    const days = computeAvailability({
      ...base,
      from: '2026-03-12',
      to: '2026-03-12',
      exceptions: [{ date: '2026-03-12', isOpen: false, capacity: null, reason: 'Feriado' }],
    });
    assert.equal(days[0]?.available, false);
    assert.equal(days[0]?.exceptionReason, 'Feriado');
  });

  it('exceção abre um dia que a regra fecharia', () => {
    const days = computeAvailability({
      ...base,
      from: '2026-03-14',
      to: '2026-03-14',
      exceptions: [{ date: '2026-03-14', isOpen: true, capacity: 3, reason: 'Mutirão' }],
    });
    assert.equal(days[0]?.available, true);
    assert.equal(days[0]?.capacity, 3);
  });
});

describe('dinheiro', () => {
  it('formata e reinterpreta em pt-BR', () => {
    assert.equal(parseBRL('R$ 1.234,56'), 123456);
    assert.equal(formatBRL(123456).replace(/ /g, ' '), 'R$ 1.234,56');
  });
});

/**
 * Fronteira do dia no fuso da loja.
 *
 * É o cálculo que decide em qual dia cada venda cai no relatório. Errar aqui
 * não quebra nada visivelmente: só move o faturamento das noites para o dia
 * seguinte, todo dia, e ninguém desconfia do total do mês porque ele fecha.
 */
describe('fronteira do dia por fuso', () => {
  it('meia-noite em São Paulo são 3h em UTC', () => {
    assert.equal(
      zonedStartOfDay('2026-03-12', 'America/Sao_Paulo').toISOString(),
      '2026-03-12T03:00:00.000Z',
    );
  });

  it('o fim do dia é o começo do seguinte, exclusivo', () => {
    assert.equal(
      zonedEndOfDay('2026-03-12', 'America/Sao_Paulo').toISOString(),
      '2026-03-13T03:00:00.000Z',
    );
  });

  it('uma venda das 21h fica no próprio dia, não no seguinte', () => {
    // 21h de 12/03 em São Paulo é 00h de 13/03 em UTC — o instante que um
    // corte por `completed_at::date` jogaria no dia errado.
    const sale = new Date('2026-03-13T00:00:00.000Z');
    assert.ok(sale >= zonedStartOfDay('2026-03-12', 'America/Sao_Paulo'));
    assert.ok(sale < zonedEndOfDay('2026-03-12', 'America/Sao_Paulo'));
  });

  it('funciona em fuso à frente de UTC', () => {
    assert.equal(
      zonedStartOfDay('2026-03-12', 'Asia/Tokyo').toISOString(),
      '2026-03-11T15:00:00.000Z',
    );
  });

  it('usa o deslocamento da data pedida, não o de hoje', () => {
    // Nova York troca de fuso em 08/03/2026: -05 antes, -04 depois.
    assert.equal(
      zonedStartOfDay('2026-03-07', 'America/New_York').toISOString(),
      '2026-03-07T05:00:00.000Z',
    );
    assert.equal(
      zonedStartOfDay('2026-03-09', 'America/New_York').toISOString(),
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('o dia da virada de horário de verão dura 23 horas', () => {
    const start = zonedStartOfDay('2026-03-08', 'America/New_York');
    const end = zonedEndOfDay('2026-03-08', 'America/New_York');
    assert.equal((end.getTime() - start.getTime()) / 3_600_000, 23);
  });

  it('recusa data fora do formato', () => {
    assert.throws(() => zonedStartOfDay('12/03/2026'), DomainError);
  });
});
