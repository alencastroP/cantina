import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cursorQuerySchema, phoneSchema, slugSchema } from './common';
import { createCustomerRequestSchema } from './customers';

/**
 * O telefone é a CHAVE NATURAL do cliente (D4): o checkout da vitrine faz
 * find-or-create sobre ele. Se a normalização divergir entre dois pontos de
 * entrada, o mesmo cliente vira dois cadastros — e o histórico dele se parte
 * ao meio sem ninguém perceber. Por isso ela é testada aqui, no contrato,
 * que é o único lugar por onde todos os pontos de entrada passam.
 */
describe('normalização de telefone', () => {
  const esperado = '+5511987654321';

  const entradas = [
    '(11) 98765-4321',
    '11 98765-4321',
    '11987654321',
    '+55 11 98765-4321',
    '5511987654321',
    ' +55 (11) 98765 4321 ',
  ];

  for (const entrada of entradas) {
    it(`normaliza "${entrada}"`, () => {
      assert.equal(phoneSchema.parse(entrada), esperado);
    });
  }

  it('aceita fixo com 10 dígitos', () => {
    assert.equal(phoneSchema.parse('(11) 3456-7890'), '+551134567890');
  });

  it('recusa número curto demais', () => {
    assert.throws(() => phoneSchema.parse('98765'));
  });

  it('recusa número longo demais', () => {
    assert.throws(() => phoneSchema.parse('1234567890123456'));
  });

  it('normaliza dentro do cadastro de cliente', () => {
    const parsed = createCustomerRequestSchema.parse({
      name: 'Maria',
      phone: '(11) 98765-4321',
    });
    assert.equal(parsed.phone, esperado);
  });
});

describe('slug', () => {
  it('aceita minúsculas com hífen', () => {
    assert.equal(slugSchema.parse('Coxinha-De-Frango'), 'coxinha-de-frango');
  });

  it('recusa espaços e acentos', () => {
    assert.throws(() => slugSchema.parse('coxinha de frango'));
    assert.throws(() => slugSchema.parse('pao-de-açucar'));
  });

  it('recusa hífen nas pontas', () => {
    assert.throws(() => slugSchema.parse('-coxinha'));
    assert.throws(() => slugSchema.parse('coxinha-'));
  });
});

describe('paginação por cursor', () => {
  it('aplica o tamanho de página padrão', () => {
    assert.equal(cursorQuerySchema.parse({}).limit, 25);
  });

  it('respeita o teto de página (invariante 9)', () => {
    assert.throws(() => cursorQuerySchema.parse({ limit: 500 }));
  });

  it('aceita limit como string, que é como chega da query', () => {
    assert.equal(cursorQuerySchema.parse({ limit: '10' }).limit, 10);
  });
});
