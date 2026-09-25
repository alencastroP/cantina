import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { trialSignupRequestSchema } = await import('@cantina/contracts');
const { assertNotBot } = await import('./signup.service');

/**
 * Este é o único endpoint público, anônimo, que cria conta — as duas coisas
 * mais baratas de errar aqui são deixar um CPF inválido passar e deixar o
 * filtro de robô barrar gente de verdade.
 */
describe('validação do corpo do cadastro', () => {
  const valid = {
    businessName: 'Doces da Ana',
    slug: 'doces-da-ana',
    ownerName: 'Ana Maria de Souza',
    email: 'ana@docesdaana.com.br',
    phone: '11987654321',
    document: '52998224725', // CPF válido conhecido
    antiAbuse: { website: '', elapsedMs: 48213 },
  };

  it('aceita um cadastro bem formado', () => {
    const result = trialSignupRequestSchema.safeParse(valid);
    assert.equal(result.success, true);
  });

  it('recusa CPF com dígito verificador errado', () => {
    const result = trialSignupRequestSchema.safeParse({ ...valid, document: '52998224700' });
    assert.equal(result.success, false);
  });

  it('recusa CPF de dígitos repetidos', () => {
    const result = trialSignupRequestSchema.safeParse({ ...valid, document: '11111111111' });
    assert.equal(result.success, false);
  });

  it('recusa slug fora do formato de endereço', () => {
    const result = trialSignupRequestSchema.safeParse({ ...valid, slug: '-invalido-' });
    assert.equal(result.success, false);
  });

  it('recusa telefone curto demais', () => {
    const result = trialSignupRequestSchema.safeParse({ ...valid, phone: '119876' });
    assert.equal(result.success, false);
  });
});

describe('filtro de robô', () => {
  it('deixa passar quem levou tempo normal e não tocou na isca', () => {
    assert.doesNotThrow(() => assertNotBot({ website: '', elapsedMs: 5000 }));
  });

  it('barra quem preencheu a isca', () => {
    assert.throws(() => assertNotBot({ website: 'http://spam.example', elapsedMs: 5000 }));
  });

  it('barra quem enviou rápido demais para ter lido o formulário', () => {
    assert.throws(() => assertNotBot({ website: '', elapsedMs: 10 }));
  });
});
