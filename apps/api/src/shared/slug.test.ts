import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('remove acentos', () => {
    assert.equal(slugify('Pão de Açúcar'), 'pao-de-acucar');
  });

  it('colapsa pontuação e espaços num hífen só', () => {
    assert.equal(slugify('Coxinha  de   frango!!! (grande)'), 'coxinha-de-frango-grande');
  });

  it('não deixa hífen nas pontas', () => {
    assert.equal(slugify('  --- Bolo ---  '), 'bolo');
  });

  it('respeita o tamanho máximo sem terminar em hífen', () => {
    const slug = slugify('a'.repeat(50) + ' ' + 'b'.repeat(50), 51);
    assert.equal(slug.length, 50);
    assert.ok(!slug.endsWith('-'));
  });

  it('devolve algo utilizável quando o nome não tem letras', () => {
    // Nome só de emoji produziria string vazia, e slug vazio viraria uma URL
    // que colide com a da própria listagem.
    assert.equal(slugify('🍕🍕🍕'), 'item');
  });
});

describe('uniqueSlug', () => {
  it('mantém o slug quando está livre', () => {
    assert.equal(uniqueSlug('coxinha', []), 'coxinha');
  });

  it('sufixa a partir de 2 na colisão', () => {
    assert.equal(uniqueSlug('coxinha', ['coxinha']), 'coxinha-2');
    assert.equal(uniqueSlug('coxinha', ['coxinha', 'coxinha-2']), 'coxinha-3');
  });

  it('ocupa o primeiro sufixo livre', () => {
    assert.equal(uniqueSlug('coxinha', ['coxinha', 'coxinha-3']), 'coxinha-2');
  });

  it('não recicla slug de produto removido', () => {
    // `findProductSlugs` consulta sem filtrar `deleted_at`, então o slug de
    // um produto removido chega aqui como ocupado. Reaproveitá-lo levaria um
    // link antigo, já compartilhado, para um produto diferente.
    const incluindoRemovidos = ['coxinha', 'coxinha-2'];
    assert.equal(uniqueSlug('coxinha', incluindoRemovidos), 'coxinha-3');
  });
});
