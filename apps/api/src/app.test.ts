import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

/**
 * Smoke test do esqueleto HTTP.
 *
 * Não toca no banco de propósito: o que está sendo verificado é a cadeia de
 * middlewares — contexto, envelope de erro, 404, headers. O isolamento por
 * RLS tem seu próprio script (`npm run verify:rls`), porque aquilo só se
 * prova contra um Postgres de verdade.
 */

// Env mínimo para o boot. Definido antes do import dinâmico, que é quando
// `config/env` valida.
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://cantina_app:cantina@localhost:5432/cantina';
process.env.DATABASE_ADMIN_URL ??= 'postgresql://postgres:postgres@localhost:5432/cantina';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { createApp } = await import('./app');

let baseUrl = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

describe('esqueleto HTTP', () => {
  it('responde no health check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { status: string; uptimeSeconds: number };
    assert.equal(body.status, 'ok');
    assert.ok(Number.isFinite(body.uptimeSeconds));
  });

  it('devolve X-Request-Id em toda resposta', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.ok(response.headers.get('x-request-id'));
  });

  it('propaga o X-Request-Id recebido, para correlacionar log', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { 'x-request-id': 'req-de-teste-123' },
    });
    assert.equal(response.headers.get('x-request-id'), 'req-de-teste-123');
  });

  it('usa o envelope único de erro no 404', async () => {
    const response = await fetch(`${baseUrl}/rota-que-nao-existe`);
    assert.equal(response.status, 404);

    const body = (await response.json()) as { error: { code: string; message: string; requestId?: string } };
    assert.equal(body.error.code, 'not_found');
    assert.ok(body.error.message.includes('/rota-que-nao-existe'));
    assert.ok(body.error.requestId, 'o envelope carrega o requestId');
  });

  it('não anuncia o framework', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  it('aplica os headers de segurança do helmet', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
});

/**
 * Módulo 1. Só os caminhos que falham ANTES de tocar o banco — validação de
 * corpo, ausência de token, ausência de cookie. O que depende de dados é
 * exercitado pelo seed e pelo `verify:rls`.
 */
describe('auth e usuários', () => {
  it('recusa login sem corpo válido, com erro por campo', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nao-e-email', password: '123' }),
    });

    assert.equal(response.status, 422);

    const body = (await response.json()) as {
      error: { code: string; details?: { fields?: Record<string, string[]> } };
    };
    assert.equal(body.error.code, 'validation_error');
    assert.ok(body.error.details?.fields?.email, 'aponta o campo email');
    assert.ok(body.error.details?.fields?.password, 'aponta o campo password');
  });

  it('recusa refresh sem cookie', async () => {
    const response = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST' });
    assert.equal(response.status, 401);
  });

  it('logout sem sessão responde 204 em vez de erro', async () => {
    // O cliente já limpou o estado dele; um erro aqui não daria nada a fazer.
    const response = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' });
    assert.equal(response.status, 204);
  });

  it('exige token em /auth/me', async () => {
    const response = await fetch(`${baseUrl}/auth/me`);
    assert.equal(response.status, 401);
  });

  it('recusa token forjado', async () => {
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Bearer nao.e.um.jwt' },
    });
    assert.equal(response.status, 401);

    const body = (await response.json()) as { error: { message: string } };
    // Mensagem genérica: token expirado, assinatura inválida e formato errado
    // respondem igual.
    assert.equal(body.error.message, 'Sessão inválida ou expirada.');
  });

  it('exige autenticação na listagem de usuários', async () => {
    const response = await fetch(`${baseUrl}/users`);
    assert.equal(response.status, 401);
  });

  it('exige autenticação nas configurações', async () => {
    const response = await fetch(`${baseUrl}/settings`);
    assert.equal(response.status, 401);
  });

  it('valida o aceite de convite antes de consultar o banco', async () => {
    const response = await fetch(`${baseUrl}/invites/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantSlug: 'loja', token: 'curto', password: '123' }),
    });

    assert.equal(response.status, 422);

    const body = (await response.json()) as {
      error: { details?: { fields?: Record<string, string[]> } };
    };
    assert.ok(body.error.details?.fields?.token);
    assert.ok(body.error.details?.fields?.password);
  });

  it('rotas públicas de convite continuam alcançáveis sem token', async () => {
    // Sem query válida dá 422 — e não 401, que indicaria que o mount de
    // autenticação vazou para uma rota pública.
    const response = await fetch(`${baseUrl}/invites`);
    assert.equal(response.status, 422);
  });
});

/**
 * Módulo 2. O catálogo inteiro fica atrás de autenticação — nada dele é
 * público. O cardápio que a vitrine mostra é outra coisa, e vem pelo
 * `/storefront` no módulo 8.
 */
describe('catálogo', () => {
  const protegidas: Array<[string, string]> = [
    ['GET', '/categories'],
    ['POST', '/categories'],
    ['PATCH', '/categories/reorder'],
    ['GET', '/products'],
    ['POST', '/products'],
    ['GET', '/products/0195f0a0-0000-7000-8000-000000000001'],
    ['PATCH', '/products/0195f0a0-0000-7000-8000-000000000001/availability'],
    ['POST', '/products/0195f0a0-0000-7000-8000-000000000001/images/upload-url'],
    ['PATCH', '/variants/0195f0a0-0000-7000-8000-000000000001'],
    ['DELETE', '/product-images/0195f0a0-0000-7000-8000-000000000001'],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }
});

/** Módulo 3. */
describe('estoque e insumos', () => {
  const protegidas: Array<[string, string]> = [
    ['GET', '/stock?kind=supply'],
    ['GET', '/stock/movements'],
    ['POST', '/stock/adjustments'],
    ['POST', '/stock/losses'],
    ['GET', '/supplies'],
    ['GET', '/supplies/low-stock'],
    ['POST', '/supplies'],
    ['GET', '/suppliers'],
    ['POST', '/suppliers'],
    ['GET', '/supply-purchases'],
    ['POST', '/supply-purchases'],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }
});

/** Módulo 4. */
describe('fichas técnicas e precificação', () => {
  const variante = '0195f0a0-0000-7000-8000-000000000001';

  const protegidas: Array<[string, string]> = [
    ['GET', `/variants/${variante}/recipe`],
    ['PUT', `/variants/${variante}/recipe`],
    ['DELETE', `/variants/${variante}/recipe`],
    ['GET', `/variants/${variante}/cost`],
    ['GET', `/variants/${variante}/availability`],
    ['GET', '/sales-channels'],
    ['POST', '/sales-channels'],
    ['POST', '/pricing/simulate'],
    ['GET', `/pricing/summary?variantIds=${variante}`],
    ['GET', `/products/${variante}/costing`],
    ['POST', '/stock/production'],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }

  it('o segundo router sobre /variants não sombreia o do catálogo', async () => {
    // Módulos 2 e 4 montam routers no mesmo prefixo. Se o do catálogo
    // engolisse o resto, `/recipe` viraria 404 em vez de 401.
    const catalogo = await fetch(`${baseUrl}/variants/${variante}`, { method: 'PATCH' });
    const ficha = await fetch(`${baseUrl}/variants/${variante}/recipe`);
    assert.equal(catalogo.status, 401);
    assert.equal(ficha.status, 401);
  });
});

/** Calendário da loja. */
describe('calendário', () => {
  const lembrete = '0195f0a0-0000-7000-8000-00000000c001';

  const protegidas: Array<[string, string]> = [
    ['GET', '/calendar?from=2026-09-01&to=2026-09-30'],
    ['POST', '/calendar/reminders'],
    ['PATCH', `/calendar/reminders/${lembrete}`],
    ['DELETE', `/calendar/reminders/${lembrete}`],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }
});

/** Módulo 5. */
describe('clientes', () => {
  const cliente = '0195f0a0-0000-7000-8000-000000000001';
  const endereco = '0195f0a0-0000-7000-8000-000000000002';

  const protegidas: Array<[string, string]> = [
    ['GET', '/customers'],
    ['POST', '/customers'],
    ['GET', `/customers/${cliente}`],
    ['PATCH', `/customers/${cliente}`],
    ['DELETE', `/customers/${cliente}`],
    ['GET', `/customers/${cliente}/orders`],
    ['POST', `/customers/${cliente}/anonymize`],
    ['GET', `/customers/${cliente}/addresses`],
    ['POST', `/customers/${cliente}/addresses`],
    ['PATCH', `/customers/${cliente}/addresses/${endereco}`],
    ['DELETE', `/customers/${cliente}/addresses/${endereco}`],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }
});

/** Módulo 6. */
describe('kanban de delivery', () => {
  const pedido = '0195f0a0-0000-7000-8000-000000000001';

  const protegidas: Array<[string, string]> = [
    ['GET', '/delivery-orders'],
    ['GET', '/delivery-orders/board'],
    ['POST', '/delivery-orders'],
    ['GET', `/delivery-orders/${pedido}`],
    ['PATCH', `/delivery-orders/${pedido}`],
    ['PATCH', `/delivery-orders/${pedido}/status`],
    ['POST', `/delivery-orders/${pedido}/cancel`],
    ['POST', `/delivery-orders/${pedido}/payment`],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }

  it('/board é rota, não um id de pedido', async () => {
    // Registrada antes de `/:id`. Na ordem inversa, "board" cairia na
    // validação de UUID e o kanban devolveria 422 em produção.
    const response = await fetch(`${baseUrl}/delivery-orders/board`);
    assert.equal(response.status, 401, 'chega no requireAuth, não em validação de id');
  });
});

/** Módulo 7. */
describe('encomendas e agenda', () => {
  const encomenda = '0195f0a0-0000-7000-8000-000000000001';

  const protegidas: Array<[string, string]> = [
    ['GET', '/preorders'],
    ['GET', '/preorders/board'],
    ['GET', '/preorders/calendar?month=2026-03'],
    ['POST', '/preorders'],
    ['GET', `/preorders/${encomenda}`],
    ['PATCH', `/preorders/${encomenda}/status`],
    ['POST', `/preorders/${encomenda}/cancel`],
    ['POST', `/preorders/${encomenda}/deposit`],
    ['GET', '/availability/rules'],
    ['PUT', '/availability/rules'],
    ['GET', '/availability/exceptions'],
    ['POST', '/availability/exceptions'],
    ['GET', '/availability/days?from=2026-03-01&to=2026-03-31'],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }

  it('/board e /calendar são rotas, não ids de encomenda', async () => {
    // Registradas antes de `/:id`. Na ordem inversa cairiam na validação de
    // UUID e o kanban devolveria 422 em produção.
    for (const path of ['/preorders/board', '/preorders/calendar?month=2026-03']) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 401, path);
    }
  });
});

/** Módulo 9. */
describe('financeiro', () => {
  const lancamento = '0195f0a0-0000-7000-8000-000000000001';

  const protegidas: Array<[string, string]> = [
    ['GET', '/finance/entries'],
    ['POST', '/finance/entries'],
    ['PATCH', `/finance/entries/${lancamento}`],
    ['POST', `/finance/entries/${lancamento}/settle`],
    ['DELETE', `/finance/entries/${lancamento}`],
    ['GET', '/finance/accounts'],
    ['POST', '/finance/accounts'],
    ['GET', '/finance/categories'],
    ['GET', '/finance/recurrences'],
    ['POST', '/finance/recurrences'],
    ['GET', '/finance/cashflow?from=2026-03-01&to=2026-03-31'],
  ];

  for (const [method, path] of protegidas) {
    it(`exige autenticação em ${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }
});
