import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Presign é computação local — nenhuma chamada de rede — então dá para
 * verificar a URL inteira sem bucket nenhum.
 */

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);
process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
process.env.STORAGE_BUCKET = 'cantina';
process.env.STORAGE_ACCESS_KEY_ID = 'minioadmin';
process.env.STORAGE_SECRET_ACCESS_KEY = 'minioadmin';
process.env.STORAGE_PUBLIC_URL = 'http://localhost:9000/cantina';

const { storageProvider } = await import('./storage');

const TENANT = '0195f0a0-0000-7000-8000-000000000001';

describe('upload pré-assinado', () => {
  it('reconhece que há credenciais configuradas', () => {
    assert.equal(storageProvider.configured, true);
    assert.equal(storageProvider.name, 's3');
  });

  it('assina um PUT com validade e escopo de bucket', async () => {
    const result = await storageProvider.presignUpload({
      tenantId: TENANT,
      contentType: 'image/webp',
      contentLength: 120_000,
      folder: 'products',
    });

    const url = new URL(result.uploadUrl);
    assert.equal(url.host, 'localhost:9000');
    // Path-style: o bucket vai no caminho, como MinIO espera.
    assert.ok(url.pathname.startsWith('/cantina/'));
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.ok(url.searchParams.get('X-Amz-Signature'));
    assert.equal(result.expiresInSeconds, 300);
  });

  it('isola os arquivos de cada empresa por prefixo de tenant', async () => {
    const result = await storageProvider.presignUpload({
      tenantId: TENANT,
      contentType: 'image/png',
      contentLength: 1000,
      folder: 'products',
    });

    // Prefixo por tenant é o que torna trivial exportar ou apagar tudo de um
    // cliente (LGPD, D24).
    assert.ok(result.publicUrl.startsWith(`http://localhost:9000/cantina/${TENANT}/products/`));
    assert.ok(result.publicUrl.endsWith('.png'));
  });

  it('recusa formato fora da lista', async () => {
    await assert.rejects(
      () =>
        storageProvider.presignUpload({
          tenantId: TENANT,
          contentType: 'application/pdf',
          contentLength: 1000,
          folder: 'products',
        }),
      /Formato não aceito/,
    );
  });

  it('recusa apagar URL que não é do storage', async () => {
    // Sem esta guarda, um `url` gravado à mão no banco viraria exclusão
    // arbitrária de objeto.
    await assert.rejects(
      () => storageProvider.delete('https://exemplo.com/foto.png'),
      /não pertence ao storage/,
    );
  });
});
