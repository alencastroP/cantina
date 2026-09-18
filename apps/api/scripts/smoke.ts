/**
 * Smoke test de ponta a ponta, contra uma API de verdade.
 *
 *   npm run smoke -w @cantina/api
 *   SMOKE_API_URL=https://api.cantina.app npm run smoke -w @cantina/api
 *
 * Percorre o caminho completo que os módulos 1 a 6 construíram:
 *
 *   login → insumo → compra (custo médio) → produto → ficha técnica →
 *   custo e margem → disponibilidade derivada → cliente → pedido →
 *   reserva → confirmação (baixa de estoque) → conclusão → cancelamento
 *   (devolução de estoque)
 *
 * Diferente dos testes unitários, este exercita banco, RLS, transações e o
 * livro de estoque juntos. É a verificação que vale rodar depois de qualquer
 * deploy — e a única que prova que a aritmética de custo chega correta na
 * ponta.
 *
 * Cria dados com sufixo de timestamp, então pode rodar quantas vezes quiser
 * no mesmo banco de testes. NÃO rode em produção: ele escreve.
 */

const API_URL = process.env.SMOKE_API_URL ?? 'http://localhost:3333/api/v1';
const EMAIL = process.env.SMOKE_EMAIL ?? 'ze@padaria.test';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'cantina123';
const TENANT_SLUG = process.env.SMOKE_TENANT ?? 'padaria-do-ze';

const marker = Date.now().toString(36);

let token = '';
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(`  FALHA ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function step(title: string): void {
  console.log(`\n${title}`);
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  expectedStatus = [200, 201, 204],
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method === 'POST' && path.includes('orders')
        ? { 'Idempotency-Key': `smoke-${marker}-${Math.random().toString(36).slice(2)}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!expectedStatus.includes(response.status)) {
    const text = await response.text().catch(() => '');
    throw new Error(`${method} ${path} → ${response.status}\n${text}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------- */

interface Id {
  id: string;
}

async function main(): Promise<void> {
  console.log(`Smoke test contra ${API_URL}\n`);

  step('1. Autenticação');
  const login = await api<{ accessToken: string; user: { email: string }; tenant: { slug: string } }>(
    'POST',
    '/auth/login',
    { email: EMAIL, password: PASSWORD, tenantSlug: TENANT_SLUG },
  );
  token = login.accessToken;
  check('login devolve access token', Boolean(token));
  check('o token é da empresa esperada', login.tenant.slug === TENANT_SLUG);

  const me = await api<{ user: { email: string } }>('GET', '/auth/me');
  check('/auth/me reconhece a sessão', me.user.email === EMAIL);

  step('2. Insumo e compra — custo médio ponderado (D11)');
  const supply = await api<Id & { name: string }>('POST', '/supplies', {
    name: `Farinha smoke ${marker}`,
    usageUnit: 'g',
    minStockQty: 1000,
  });
  check('insumo criado', Boolean(supply.id));

  // 5 kg por R$ 50, usada em gramas → 1 centavo por grama.
  const purchase = await api<{ unitCost: number; avgUnitCostAfter: number }>(
    'POST',
    '/supply-purchases',
    {
      supplyId: supply.id,
      purchaseQty: 5,
      purchaseUnit: 'kg',
      totalCents: 5000,
    },
  );
  check('custo da compra = 1 centavo/g', purchase.unitCost === 1, `veio ${purchase.unitCost}`);
  check(
    'custo médio depois da compra = 1',
    purchase.avgUnitCostAfter === 1,
    `veio ${purchase.avgUnitCostAfter}`,
  );

  const supplyAfter = await api<{ qtyOnHand: number; avgUnitCost: number; isLow: boolean }>(
    'GET',
    `/supplies/${supply.id}`,
  );
  check('a compra deu entrada de 5000 g', supplyAfter.qtyOnHand === 5000, `veio ${supplyAfter.qtyOnHand}`);
  check('não está abaixo do mínimo', supplyAfter.isLow === false);

  step('3. Produto sob demanda e ficha técnica');
  const category = await api<Id>('POST', '/categories', { name: `Smoke ${marker}` });

  const product = await api<Id & { variants: Array<Id & { priceCents: number }> }>(
    'POST',
    '/products',
    {
      name: `Coxinha smoke ${marker}`,
      categoryId: category.id,
      stockMode: 'on_demand',
      variants: [{ priceCents: 700 }],
    },
  );
  const variantId = product.variants[0]!.id;
  check('produto criado já com variação padrão (P13)', product.variants.length === 1);

  // 30 g com 5% de perda → 31,5 g efetivos → 32 centavos de custo.
  await api('PUT', `/variants/${variantId}/recipe`, {
    yieldQty: 1,
    items: [{ supplyId: supply.id, qty: 30, wastePercent: 5 }],
  });

  const cost = await api<{ unitCostCents: number; hasUnknownCost: boolean; marginCents: number }>(
    'GET',
    `/variants/${variantId}/cost`,
  );
  check('custo unitário = 32 centavos', cost.unitCostCents === 32, `veio ${cost.unitCostCents}`);
  check('nenhum insumo sem custo', cost.hasUnknownCost === false);

  const availability = await api<{ availableUnits: number | null; limitingSupplyName: string | null }>(
    'GET',
    `/variants/${variantId}/availability`,
  );
  // 5000 g disponíveis ÷ 31,5 g por unidade = 158 unidades.
  check(
    'disponibilidade derivada da receita = 158',
    availability.availableUnits === 158,
    `veio ${availability.availableUnits}`,
  );
  check('aponta o insumo que limita', availability.limitingSupplyName === supply.name);

  step('4. Simulação de margem por canal (D13)');
  const channel = await api<Id & { name: string }>('POST', '/sales-channels', {
    name: `iFood smoke ${marker}`,
    kind: 'marketplace',
    commissionPercent: 23,
  });

  const simulation = await api<{
    channels: Array<{ channelId: string; marginCents: number; suggestedPriceCents?: number }>;
  }>('POST', '/pricing/simulate', {
    variantId,
    channelIds: [channel.id],
    targetMarginPercent: 50,
  });

  const simulated = simulation.channels.find((row) => row.channelId === channel.id);
  // 700 − 23% = 539 líquido; 539 − 32 de custo = 507 de margem.
  check('margem no canal = 507 centavos', simulated?.marginCents === 507, `veio ${simulated?.marginCents}`);
  check('sugere preço para a margem-alvo', (simulated?.suggestedPriceCents ?? 0) > 700);

  step('5. Cliente e pedido — reserva e baixa de estoque (D14)');
  const customer = await api<Id & { name: string }>('POST', '/customers', {
    name: `Maria Smoke ${marker}`,
    phone: `1198765${String(Date.now()).slice(-4)}`,
  });

  const order = await api<
    Id & { code: number; status: string; totalCents: number; costCents: number }
  >('POST', '/delivery-orders', {
    customer: { customerId: customer.id },
    fulfillment: 'pickup',
    items: [{ productVariantId: variantId, qty: 2 }],
  });

  check('pedido do painel nasce confirmado', order.status === 'confirmed', `veio ${order.status}`);
  check('total = 1400 centavos', order.totalCents === 1400, `veio ${order.totalCents}`);
  check('custo congelado = 64 centavos', order.costCents === 64, `veio ${order.costCents}`);

  const stock = await api<{ items: Array<{ refId: string; qtyOnHand: number; qtyReserved: number }> }>(
    'GET',
    `/stock?kind=supply&limit=100`,
  );
  const farinha = stock.items.find((row) => row.refId === supply.id);
  // 2 unidades × 31,5 g = 63 g saíram do físico na confirmação.
  check(
    'confirmação baixou 63 g de farinha',
    farinha?.qtyOnHand === 4937,
    `veio ${farinha?.qtyOnHand}`,
  );
  check('nada ficou reservado depois da confirmação', farinha?.qtyReserved === 0);

  step('6. Fluxo do kanban até a conclusão');
  for (const status of ['preparing', 'ready', 'completed']) {
    const moved = await api<{ status: string }>('PATCH', `/delivery-orders/${order.id}/status`, {
      status,
    });
    check(`transição para "${status}"`, moved.status === status);
  }

  const history = await api<{ items: Array<{ id: string; kind: string }> }>(
    'GET',
    `/customers/${customer.id}/orders`,
  );
  check('pedido aparece no histórico do cliente', history.items.some((row) => row.id === order.id));
  check('histórico identifica o tipo', history.items[0]?.kind === 'delivery');

  step('7. Cancelamento devolve o estoque');
  const second = await api<Id>('POST', '/delivery-orders', {
    customer: { customerId: customer.id },
    fulfillment: 'pickup',
    items: [{ productVariantId: variantId, qty: 3 }],
  });

  await api('POST', `/delivery-orders/${second.id}/cancel`, { reason: 'Teste de smoke' });

  const stockAfterCancel = await api<{ items: Array<{ refId: string; qtyOnHand: number }> }>(
    'GET',
    `/stock?kind=supply&limit=100`,
  );
  const farinhaFinal = stockAfterCancel.items.find((row) => row.refId === supply.id);
  check(
    'cancelar devolveu os 94,5 g ao estoque',
    farinhaFinal?.qtyOnHand === 4937,
    `veio ${farinhaFinal?.qtyOnHand}`,
  );

  step('8. Regras de negócio recusam o que deve recusar');

  const invalidTransition = await fetch(`${API_URL}/delivery-orders/${order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'preparing' }),
  });
  check('status terminal não volta atrás', invalidTransition.status === 409);

  const deleteUsedSupply = await fetch(`${API_URL}/supplies/${supply.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  check('insumo em ficha técnica não pode ser removido', deleteUsedSupply.status === 409);

  const produceOnDemand = await fetch(`${API_URL}/stock/production`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productVariantId: variantId, qty: 10 }),
  });
  check('produto sob demanda não pode ser produzido', produceOnDemand.status === 409);

  step('9. Relatórios — os números do dia batem com o que aconteceu');

  // A data de hoje NO FUSO DA LOJA. Usar a do servidor faria a venda das 21h
  // cair no relatório de amanhã, e este passo passaria a falhar toda noite.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const range = `from=${today}&to=${today}`;

  const summary = await api<{
    revenueCents: number;
    ordersCount: number;
    costOfGoodsCents: number;
    grossMarginCents: number;
    operatingExpensesCents: number;
    supplyPurchasesCents: number;
    resultCents: number;
    canceledCount: number;
  }>('GET', `/reports/summary?${range}`);

  check(
    'faturamento do dia inclui o pedido concluído',
    summary.revenueCents >= 1400,
    `veio ${summary.revenueCents}`,
  );
  check('custo dos vendidos inclui os 64 centavos', summary.costOfGoodsCents >= 64);
  check(
    'margem bruta = receita − custo',
    summary.grossMarginCents === summary.revenueCents - summary.costOfGoodsCents,
  );
  check('o pedido cancelado foi contado à parte', summary.canceledCount >= 1);

  // A compra de farinha do passo 2 saiu do caixa hoje. Ela precisa APARECER
  // no resumo e NÃO entrar no resultado: é estoque, não despesa do mês.
  check(
    'compra de insumo aparece como desembolso',
    summary.supplyPurchasesCents >= 5000,
    `veio ${summary.supplyPurchasesCents}`,
  );
  check(
    'compra de insumo não é descontada do resultado',
    summary.resultCents === summary.grossMarginCents - summary.operatingExpensesCents,
    `resultado ${summary.resultCents}`,
  );

  const byKind = await api<{ rows: Array<{ key: string; label: string; revenueCents: number }> }>(
    'GET',
    `/reports/sales?${range}&groupBy=kind`,
  );
  check(
    'agrupamento por tipo traz o pedido do dia',
    byKind.rows.some((row) => row.key === 'delivery'),
  );
  check(
    'as linhas somam o faturamento do resumo',
    byKind.rows.reduce((total, row) => total + row.revenueCents, 0) === summary.revenueCents,
  );

  const byDay = await api<{ rows: Array<{ key: string; revenueCents: number }> }>(
    'GET',
    `/reports/sales?${range}&groupBy=day`,
  );
  check(
    'o dia agrupado é hoje no fuso da loja',
    byDay.rows[0]?.key === today,
    `veio ${byDay.rows[0]?.key}`,
  );

  const products = await api<{
    rows: Array<{ productVariantId: string | null; qty: number; revenueCents: number }>;
    totalRevenueCents: number;
  }>('GET', `/reports/products?${range}&orderBy=revenue`);
  const sold = products.rows.find((row) => row.productVariantId === variantId);
  check('a coxinha aparece no ranking', sold !== undefined);
  check('com as 2 unidades vendidas', (sold?.qty ?? 0) >= 2, `veio ${sold?.qty}`);
  check('e os 1400 centavos de item', (sold?.revenueCents ?? 0) >= 1400);

  const costs = await api<{
    rows: Array<{ supplyId: string; consumedQty: number; purchasedCents: number }>;
    totalPurchasedCents: number;
  }>('GET', `/reports/costs?${range}`);
  const flour = costs.rows.find((row) => row.supplyId === supply.id);
  check('a farinha aparece no relatório de custos', flour !== undefined);
  check(
    'com os 63 g consumidos na venda',
    (flour?.consumedQty ?? 0) >= 63,
    `veio ${flour?.consumedQty}`,
  );
  check('e a compra do dia', (flour?.purchasedCents ?? 0) >= 5000);

  console.log(`\n${passed} verificações passaram, ${failed} falharam.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('\nSmoke test interrompido:\n', error);
  process.exitCode = 1;
});
