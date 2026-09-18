import {
  availabilityRules,
  categories,
  deliveryZones,
  financeAccounts,
  financeCategories,
  orderStatusLabels,
  plans,
  platformUsers,
  productVariants,
  products,
  recipeItems,
  recipes,
  salesChannels,
  stockItems,
  stockMovements,
  supplies,
  supplyPurchases,
  suppliers,
  tenantDomains,
  tenantSettings,
  tenants,
  users,
  withTenant,
} from '@cantina/db';
import {
  DEFAULT_DELIVERY_LABELS,
  DEFAULT_PREORDER_LABELS,
  purchaseUnitCost,
  weightedAverageUnitCost,
} from '@cantina/domain';
import { eq } from 'drizzle-orm';

import { env } from '../src/config/env';
import { appDb, closeDatabases, platformDb } from '../src/db';
import { hashPassword } from '../src/shared/password';

/**
 * Seed de desenvolvimento.
 *
 * Cria uma empresa completa e coerente: catálogo com os DOIS modos de estoque
 * (D9), insumos com compras reais para o custo médio ter de onde sair (D11),
 * e a agenda configurada. Serve para conferir à mão que RLS, custo e
 * disponibilidade batem antes de existir qualquer tela.
 *
 * Idempotente: rodar de novo não duplica.
 */

const TENANT_SLUG = 'padaria-do-ze';
const OWNER_EMAIL = 'ze@padaria.test';
const OWNER_PASSWORD = 'cantina123';
const ADMIN_EMAIL = 'admin@cantina.test';
const ADMIN_PASSWORD = 'cantina123';

async function main(): Promise<void> {
  /* --- Plataforma (fora do RLS) ------------------------------------------ */

  // Três planos: o barato para quem está começando, o do meio (o padrão do
  // seed) e um sem teto. Limite ausente significa SEM limite — nunca zero.
  const PLANS = [
    {
      code: 'inicial',
      name: 'Inicial',
      description: 'Vitrine e pedidos, para quem está começando.',
      priceCents: 4900,
      limits: { maxProducts: 40, maxOrdersPerMonth: 300, maxUsers: 2 },
    },
    {
      code: 'essencial',
      name: 'Essencial',
      description: 'Vitrine, pedidos, estoque e financeiro.',
      priceCents: 9900,
      limits: { maxProducts: 200, maxOrdersPerMonth: 1500, maxUsers: 5 },
    },
    {
      code: 'completo',
      name: 'Completo',
      description: 'Tudo, sem limite de cadastro.',
      priceCents: 19900,
      limits: {},
    },
  ];

  let plan: typeof plans.$inferSelect | undefined;

  for (const values of PLANS) {
    const [row] = await platformDb.db
      .insert(plans)
      .values(values)
      .onConflictDoUpdate({
        target: plans.code,
        set: { name: values.name, priceCents: values.priceCents, limits: values.limits },
      })
      .returning();

    if (values.code === 'essencial') plan = row;
  }

  if (!plan) throw new Error('Falha ao criar o plano.');

  // Administrador da plataforma (D5). Sessão separada da do lojista.
  await platformDb.db
    .insert(platformUsers)
    .values({
      email: ADMIN_EMAIL,
      name: 'Suporte Cantina',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'owner',
    })
    .onConflictDoNothing({ target: platformUsers.email });

  const existing = await platformDb.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, TENANT_SLUG))
    .limit(1);

  if (existing[0]) {
    console.log(`  Tenant "${TENANT_SLUG}" já existe (${existing[0].id}). Nada a fazer.`);
    return;
  }

  const [tenant] = await platformDb.db
    .insert(tenants)
    .values({
      slug: TENANT_SLUG,
      name: 'Padaria do Zé',
      legalName: 'Padaria do Zé LTDA',
      document: '12345678000199',
      status: 'active',
      planId: plan.id,
    })
    .returning();

  if (!tenant) throw new Error('Falha ao criar o tenant.');

  await platformDb.db.insert(tenantDomains).values({
    tenantId: tenant.id,
    hostname: `${TENANT_SLUG}.${env.ROOT_DOMAIN}`,
    type: 'subdomain',
    isPrimary: true,
    verifiedAt: new Date(),
  });

  /* --- Dados do tenant (dentro do RLS) ----------------------------------- */

  await withTenant(appDb.db, tenant.id, async (tx) => {
    await tx.insert(tenantSettings).values({
      tenantId: tenant.id,
      about: 'Pão quente todo dia às 6h. Encomendas de bolo com 2 dias de antecedência.',
      contactPhone: '+5511999998888',
      whatsappNumber: '+5511999998888',
      whatsappMode: 'persist',
      minOrderCents: 2000,
      preorderLeadTimeHours: 48,
      preorderHorizonDays: 60,
      reservationTtlMinutes: 60,
      address: {
        street: 'Rua das Acácias',
        number: '120',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zip: '01000000',
      },
    });

    await tx.insert(users).values({
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      name: 'Zé',
      role: 'owner',
      status: 'active',
      passwordHash: await hashPassword(OWNER_PASSWORD),
    });

    /* Rótulos das colunas do kanban (D18): código fixo, rótulo editável. */
    await tx.insert(orderStatusLabels).values([
      ...Object.entries(DEFAULT_DELIVERY_LABELS).map(([statusCode, label], index) => ({
        tenantId: tenant.id,
        flow: 'delivery' as const,
        statusCode,
        label,
        position: index,
      })),
      ...Object.entries(DEFAULT_PREORDER_LABELS).map(([statusCode, label], index) => ({
        tenantId: tenant.id,
        flow: 'preorder' as const,
        statusCode,
        label,
        position: index,
      })),
    ]);

    await tx.insert(salesChannels).values([
      {
        tenantId: tenant.id,
        name: 'Vitrine própria',
        kind: 'own_storefront',
        commissionPercent: 0,
        paymentFeePercent: 0,
        isDefault: true,
      },
      { tenantId: tenant.id, name: 'Balcão', kind: 'counter' },
      {
        tenantId: tenant.id,
        name: 'iFood',
        kind: 'marketplace',
        commissionPercent: 23,
        paymentFeePercent: 0,
        absorbsDeliveryFee: true,
      },
    ]);

    await tx.insert(deliveryZones).values([
      { tenantId: tenant.id, name: 'Centro', neighborhood: 'Centro', feeCents: 500, etaMinutes: 30 },
      { tenantId: tenant.id, name: 'Jardins', neighborhood: 'Jardins', feeCents: 900, etaMinutes: 45 },
    ]);

    /* Agenda: encomendas de terça a sábado (D10). */
    await tx.insert(availabilityRules).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId: tenant.id,
        weekday,
        isOpen: weekday >= 2 && weekday <= 6,
        capacity: weekday === 6 ? 8 : weekday >= 2 ? 5 : 0,
      })),
    );

    await tx.insert(financeAccounts).values([
      { tenantId: tenant.id, name: 'Caixa', kind: 'cash', isDefault: true },
      { tenantId: tenant.id, name: 'Conta corrente', kind: 'bank' },
    ]);

    await tx.insert(financeCategories).values([
      { tenantId: tenant.id, name: 'Vendas', direction: 'in' },
      { tenantId: tenant.id, name: 'Insumos', direction: 'out' },
      { tenantId: tenant.id, name: 'Embalagens', direction: 'out' },
      { tenantId: tenant.id, name: 'Aluguel', direction: 'out' },
      { tenantId: tenant.id, name: 'Energia e água', direction: 'out' },
      { tenantId: tenant.id, name: 'Impostos', direction: 'out' },
    ]);

    /* --- Insumos e compras: o custo tem que vir de algum lugar (D11) --- */

    const [fornecedor] = await tx
      .insert(suppliers)
      .values({ tenantId: tenant.id, name: 'Atacado Central', phone: '+5511977776666' })
      .returning();

    const insumos = await tx
      .insert(supplies)
      .values([
        { tenantId: tenant.id, name: 'Farinha de trigo', usageUnit: 'g', minStockQty: 2000 },
        { tenantId: tenant.id, name: 'Frango desfiado', usageUnit: 'g', minStockQty: 1000 },
        { tenantId: tenant.id, name: 'Óleo de soja', usageUnit: 'ml', minStockQty: 900 },
        {
          tenantId: tenant.id,
          name: 'Embalagem salgado',
          type: 'packaging',
          usageUnit: 'un',
          minStockQty: 50,
        },
      ])
      .returning();

    const bySupplyName = new Map(insumos.map((supply) => [supply.name, supply]));

    /**
     * Cada compra faz as duas coisas de uma vez: dá entrada no estoque e
     * recalcula o custo médio. É o fluxo real do módulo 3.
     */
    const comprasPlanejadas = [
      { nome: 'Farinha de trigo', purchaseQty: 5, unit: 'kg' as const, factor: 1000, totalCents: 5000 },
      { nome: 'Frango desfiado', purchaseQty: 3, unit: 'kg' as const, factor: 1000, totalCents: 9000 },
      { nome: 'Óleo de soja', purchaseQty: 9, unit: 'l' as const, factor: 1000, totalCents: 8100 },
      { nome: 'Embalagem salgado', purchaseQty: 500, unit: 'un' as const, factor: 1, totalCents: 2500 },
    ];

    for (const compra of comprasPlanejadas) {
      const supply = bySupplyName.get(compra.nome);
      if (!supply) continue;

      const unitCost = purchaseUnitCost({
        purchaseQty: compra.purchaseQty,
        conversionFactor: compra.factor,
        totalCents: compra.totalCents,
      });
      const usageQty = compra.purchaseQty * compra.factor;

      await tx.insert(supplyPurchases).values({
        tenantId: tenant.id,
        supplyId: supply.id,
        supplierId: fornecedor?.id ?? null,
        purchaseQty: compra.purchaseQty,
        purchaseUnit: compra.unit,
        conversionFactor: compra.factor,
        totalCents: compra.totalCents,
        unitCost,
      });

      // Estoque partia de zero, então a média ponderada é o custo da compra.
      const avgUnitCost = weightedAverageUnitCost({
        currentQty: 0,
        currentUnitCost: 0,
        incomingQty: usageQty,
        incomingUnitCost: unitCost,
      });

      await tx.update(supplies).set({ avgUnitCost }).where(eq(supplies.id, supply.id));

      await tx
        .insert(stockItems)
        .values({ tenantId: tenant.id, kind: 'supply', refId: supply.id, qtyOnHand: usageQty });

      await tx.insert(stockMovements).values({
        tenantId: tenant.id,
        kind: 'supply',
        refId: supply.id,
        type: 'purchase',
        qtyDelta: usageQty,
        balanceAfter: usageQty,
        unitCost,
        source: 'supply_purchase',
      });
    }

    /* --- Catálogo: um produto de cada modo de estoque (D9) --- */

    const [salgados] = await tx
      .insert(categories)
      .values({ tenantId: tenant.id, name: 'Salgados', slug: 'salgados', position: 0 })
      .returning();

    const [bebidas] = await tx
      .insert(categories)
      .values({ tenantId: tenant.id, name: 'Bebidas', slug: 'bebidas', position: 1 })
      .returning();

    // `on_demand`: disponível enquanto houver insumo.
    const [coxinha] = await tx
      .insert(products)
      .values({
        tenantId: tenant.id,
        categoryId: salgados?.id ?? null,
        name: 'Coxinha de frango',
        slug: 'coxinha-de-frango',
        description: 'Massa de batata, recheio de frango desfiado.',
        stockMode: 'on_demand',
      })
      .returning();

    const [coxinhaVariant] = await tx
      .insert(productVariants)
      .values({
        tenantId: tenant.id,
        productId: coxinha!.id,
        name: 'Unidade',
        priceCents: 700,
        isDefault: true,
      })
      .returning();

    const [receita] = await tx
      .insert(recipes)
      .values({ tenantId: tenant.id, productVariantId: coxinhaVariant!.id, yieldQty: 1 })
      .returning();

    await tx.insert(recipeItems).values([
      {
        tenantId: tenant.id,
        recipeId: receita!.id,
        supplyId: bySupplyName.get('Farinha de trigo')!.id,
        qty: 30,
        wastePercent: 5,
      },
      {
        tenantId: tenant.id,
        recipeId: receita!.id,
        supplyId: bySupplyName.get('Frango desfiado')!.id,
        qty: 25,
        wastePercent: 0,
      },
      {
        tenantId: tenant.id,
        recipeId: receita!.id,
        supplyId: bySupplyName.get('Óleo de soja')!.id,
        qty: 8,
        wastePercent: 0,
      },
      {
        tenantId: tenant.id,
        recipeId: receita!.id,
        supplyId: bySupplyName.get('Embalagem salgado')!.id,
        qty: 1,
        wastePercent: 0,
      },
    ]);

    // `tracked`: conta unidades, sem receita. É o refrigerante revendido.
    const [refri] = await tx
      .insert(products)
      .values({
        tenantId: tenant.id,
        categoryId: bebidas?.id ?? null,
        name: 'Refrigerante lata 350ml',
        slug: 'refrigerante-lata',
        stockMode: 'tracked',
      })
      .returning();

    const [refriVariant] = await tx
      .insert(productVariants)
      .values({
        tenantId: tenant.id,
        productId: refri!.id,
        name: 'Unidade',
        priceCents: 600,
        isDefault: true,
      })
      .returning();

    await tx.insert(stockItems).values({
      tenantId: tenant.id,
      kind: 'product_variant',
      refId: refriVariant!.id,
      qtyOnHand: 24,
    });

    await tx.insert(stockMovements).values({
      tenantId: tenant.id,
      kind: 'product_variant',
      refId: refriVariant!.id,
      type: 'adjustment',
      qtyDelta: 24,
      balanceAfter: 24,
      reason: 'Carga inicial do seed',
      source: 'manual',
    });
  });

  console.log(`
  Seed concluído.

    Vitrine   http://${TENANT_SLUG}.${env.ROOT_DOMAIN}:3000
    Painel    ${env.WEB_URL}/entrar
    Login     ${OWNER_EMAIL} / ${OWNER_PASSWORD}

    Admin     ${env.WEB_URL}/admin
    Login     ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}

    Tenant    ${tenant.id}
`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabases());
