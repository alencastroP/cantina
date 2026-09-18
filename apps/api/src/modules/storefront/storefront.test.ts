import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { isOpenNow, weekdayIn } = await import('./storefront.service');

/**
 * "A loja está aberta?" é calculado no fuso da LOJA, não no do servidor.
 *
 * Este é o tipo de bug que não aparece em desenvolvimento — a máquina do dev
 * costuma estar no mesmo fuso do banco — e aparece quando o servidor sobe numa
 * região diferente, ou quando o horário de verão de outro país muda a
 * diferença. Daí o teste ancorado em instantes UTC explícitos.
 */
describe('horário de funcionamento da vitrine', () => {
  const SP = 'America/Sao_Paulo';

  // Sábado, 15/03/2026, 12:00 em São Paulo = 15:00 UTC.
  const sabadoMeioDia = new Date('2026-03-14T15:00:00Z');

  it('descobre o dia da semana no fuso da loja', () => {
    assert.equal(weekdayIn(sabadoMeioDia, SP), 6, 'sábado');
    assert.equal(weekdayIn(sabadoMeioDia, 'UTC'), 6);
  });

  it('vira o dia antes em São Paulo do que em UTC', () => {
    // 02:00 UTC de domingo ainda é sábado 23:00 em São Paulo.
    const madrugada = new Date('2026-03-15T02:00:00Z');
    assert.equal(weekdayIn(madrugada, 'UTC'), 0, 'domingo em UTC');
    assert.equal(weekdayIn(madrugada, SP), 6, 'ainda sábado na loja');
  });

  const hours = [
    { weekday: 6, opensAt: '08:00', closesAt: '18:00' },
    { weekday: 0, opensAt: '08:00', closesAt: '12:00' },
  ];

  it('está aberta dentro da faixa', () => {
    assert.equal(isOpenNow(hours, SP, sabadoMeioDia), true);
  });

  it('está fechada antes de abrir', () => {
    // 07:00 em São Paulo = 10:00 UTC.
    assert.equal(isOpenNow(hours, SP, new Date('2026-03-14T10:00:00Z')), false);
  });

  it('está fechada depois de fechar', () => {
    // 19:00 em São Paulo = 22:00 UTC.
    assert.equal(isOpenNow(hours, SP, new Date('2026-03-14T22:00:00Z')), false);
  });

  it('está fechada em dia sem horário cadastrado', () => {
    // Segunda, 16/03/2026, 12:00 em São Paulo.
    assert.equal(isOpenNow(hours, SP, new Date('2026-03-16T15:00:00Z')), false);
  });

  it('usa o fuso da loja, não o do servidor', () => {
    // Domingo, 10:00 em São Paulo = 13:00 UTC. A loja abre 08:00–12:00 no
    // domingo: pelo relógio dela está aberta, pelo do servidor em UTC já
    // fechou. É exatamente o bug que aparece só depois do deploy.
    const domingoManha = new Date('2026-03-15T13:00:00Z');
    assert.equal(isOpenNow(hours, SP, domingoManha), true, 'domingo 10h na loja');
    assert.equal(isOpenNow(hours, 'UTC', domingoManha), false, 'domingo 13h em UTC');
  });

  it('sem horário cadastrado, a loja nunca aparece aberta', () => {
    assert.equal(isOpenNow([], SP, sabadoMeioDia), false);
  });
});
