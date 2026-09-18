import { customers, tenants, withTenant } from '@cantina/db';
import { eq, inArray } from 'drizzle-orm';

import { appDb, closeDatabases, platformDb } from '../src/db';

/**
 * Prova de isolamento entre empresas.
 *
 * É o teste que justifica a decisão D1. Roda contra um Postgres real porque
 * o que está sendo verificado é a política do banco, não código TypeScript —
 * um mock aqui não provaria nada.
 *
 *   npm run verify:rls -w @cantina/api
 *
 * Cria dois tenants descartáveis, prova as quatro propriedades abaixo e
 * apaga tudo. Seguro de rodar em desenvolvimento; nunca em produção.
 */

let failures = 0;

function check(name: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.error(`  FALHA ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  const created = await platformDb.db
    .insert(tenants)
    .values([
      { slug: `rls-a-${Date.now()}`, name: 'RLS A', status: 'active' },
      { slug: `rls-b-${Date.now()}`, name: 'RLS B', status: 'active' },
    ])
    .returning({ id: tenants.id });

  const [tenantA, tenantB] = created;
  if (!tenantA || !tenantB) throw new Error('Falha ao criar tenants de teste.');

  try {
    await withTenant(appDb.db, tenantA.id, (tx) =>
      tx.insert(customers).values({ tenantId: tenantA.id, name: 'Cliente A', phone: '+5511900000001' }),
    );
    await withTenant(appDb.db, tenantB.id, (tx) =>
      tx.insert(customers).values({ tenantId: tenantB.id, name: 'Cliente B', phone: '+5511900000002' }),
    );

    /* 1. Leitura só enxerga o próprio tenant. */
    const seenByA = await withTenant(appDb.db, tenantA.id, (tx) =>
      tx.select({ id: customers.id, name: customers.name }).from(customers),
    );
    check(
      'leitura no contexto de A não devolve dados de B',
      seenByA.every((row) => row.name === 'Cliente A'),
      `retornou: ${seenByA.map((r) => r.name).join(', ')}`,
    );

    /* 2. Query SEM `where` de tenant também é isolada — é o ponto do RLS. */
    check(
      'select sem where devolve apenas 1 linha (a de A)',
      seenByA.length === 1,
      `retornou ${seenByA.length} linhas`,
    );

    /* 3. Escrita com tenant alheio é recusada pelo WITH CHECK. */
    let blocked = false;
    try {
      await withTenant(appDb.db, tenantA.id, (tx) =>
        tx.insert(customers).values({
          tenantId: tenantB.id,
          name: 'Invasor',
          phone: '+5511900000003',
        }),
      );
    } catch {
      blocked = true;
    }
    check('insert com tenant_id de outra empresa é recusado', blocked);

    /* 4. Sem contexto aberto, não se vê nada. */
    const noContext = await appDb.db.select({ id: customers.id }).from(customers);
    check(
      'consulta fora de withTenant não devolve linha alguma',
      noContext.length === 0,
      `retornou ${noContext.length} linhas`,
    );
  } finally {
    await platformDb.db.delete(tenants).where(inArray(tenants.id, [tenantA.id, tenantB.id]));
    await platformDb.db.delete(customers).where(eq(customers.tenantId, tenantA.id));
  }

  if (failures > 0) {
    console.error(`\n  ${failures} verificação(ões) falharam. O isolamento NÃO está garantido.`);
    process.exitCode = 1;
  } else {
    console.log('\n  Isolamento por RLS verificado.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabases());
