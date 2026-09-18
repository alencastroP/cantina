import type {
  CostSummary,
  ProductCosting,
  PutRecipeRequest,
  Recipe,
  RecipeCostLine,
  VariantAvailability,
  VariantCost,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  availableQty,
  channelMargin,
  maxProducibleUnits,
  recipeCost,
  roundCents,
  type RecipeCostItem,
  type SalesChannelFees,
} from '@cantina/domain';

import { notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import * as repository from './recipes.repository';

/**
 * Fichas técnicas (§6.6 do PLAN.md).
 *
 * Este módulo é o dono de `recipes` e `recipe_items`. Todo cálculo de custo
 * do sistema sai daqui — inclusive o custo congelado no item do pedido (D11),
 * que os kanbans vão pedir por `computeUnitCost`.
 */

/** Canal neutro: usado quando a empresa ainda não cadastrou um padrão. */
const NO_FEES: SalesChannelFees = {
  commissionPercent: 0,
  paymentFeePercent: 0,
  fixedFeeCents: 0,
  absorbsDeliveryFee: false,
};

export function toChannelFees(row: repository.SalesChannelRow): SalesChannelFees {
  return {
    commissionPercent: row.commissionPercent,
    paymentFeePercent: row.paymentFeePercent,
    fixedFeeCents: row.fixedFeeCents,
    absorbsDeliveryFee: row.absorbsDeliveryFee,
  };
}

function toCostItems(items: readonly repository.RecipeItemWithSupply[]): RecipeCostItem[] {
  return items.map((item) => ({
    supplyId: item.supplyId,
    supplyName: item.supplyName,
    qty: item.qty,
    wastePercent: item.wastePercent,
    unitCost: item.avgUnitCost,
  }));
}

function toCostLines(
  items: readonly repository.RecipeItemWithSupply[],
  breakdown: ReturnType<typeof recipeCost>,
): RecipeCostLine[] {
  const byId = new Map(items.map((item) => [item.supplyId, item]));

  return breakdown.lines.map((line) => {
    const item = byId.get(line.supplyId)!;
    return {
      supplyId: line.supplyId,
      supplyName: line.supplyName,
      unit: item.unit,
      qty: item.qty,
      wastePercent: item.wastePercent,
      effectiveQty: line.effectiveQty,
      unitCost: item.avgUnitCost,
      costCents: line.costCents,
      sharePercent: line.sharePercent,
      costUnknown: item.costUnknown,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

async function loadVariantOrThrow(tx: Transaction, variantId: string) {
  const variant = await repository.findVariantContext(tx, variantId);
  if (!variant) throw notFound('Variação de produto não encontrada.');
  return variant;
}

export async function getRecipe(tx: Transaction, variantId: string): Promise<Recipe> {
  const variant = await loadVariantOrThrow(tx, variantId);

  const recipe = await repository.findRecipeByVariant(tx, variantId);
  if (!recipe) throw notFound('Este produto ainda não tem ficha técnica.');

  const items = await repository.listRecipeItems(tx, recipe.id);
  const breakdown = recipeCost(toCostItems(items), recipe.yieldQty);

  return {
    variantId,
    productName: variant.productName,
    variantName: variant.variantName,
    yieldQty: recipe.yieldQty,
    notes: recipe.notes,
    items: toCostLines(items, breakdown),
  };
}

export interface UnitCostResult {
  unitCostCents: number;
  batchCostCents: number;
  yieldQty: number;
  lines: RecipeCostLine[];
  hasUnknownCost: boolean;
  hasRecipe: boolean;
}

/**
 * Custo unitário atual da variação.
 *
 * Sem ficha técnica devolve zero com `hasRecipe: false` em vez de estourar —
 * um produto revendido (refrigerante) legitimamente não tem receita, e o
 * pedido precisa poder ser fechado do mesmo jeito.
 */
export async function computeUnitCost(
  tx: Transaction,
  variantId: string,
): Promise<UnitCostResult> {
  const recipe = await repository.findRecipeByVariant(tx, variantId);

  if (!recipe) {
    return {
      unitCostCents: 0,
      batchCostCents: 0,
      yieldQty: 1,
      lines: [],
      hasUnknownCost: false,
      hasRecipe: false,
    };
  }

  const items = await repository.listRecipeItems(tx, recipe.id);
  const breakdown = recipeCost(toCostItems(items), recipe.yieldQty);

  return {
    unitCostCents: breakdown.unitCostCents,
    batchCostCents: breakdown.batchCostCents,
    yieldQty: recipe.yieldQty,
    lines: toCostLines(items, breakdown),
    hasUnknownCost: items.some((item) => item.costUnknown),
    hasRecipe: true,
  };
}

export async function getCost(tx: Transaction, variantId: string): Promise<VariantCost> {
  const variant = await loadVariantOrThrow(tx, variantId);
  const cost = await computeUnitCost(tx, variantId);

  const defaultChannel = await repository.findDefaultSalesChannel(tx);
  const margin = channelMargin(
    { priceCents: variant.priceCents, unitCostCents: cost.unitCostCents },
    defaultChannel ? toChannelFees(defaultChannel) : NO_FEES,
  );

  return {
    variantId,
    productName: variant.productName,
    variantName: variant.variantName,
    priceCents: variant.priceCents,
    yieldQty: cost.yieldQty,
    unitCostCents: cost.unitCostCents,
    batchCostCents: cost.batchCostCents,
    marginCents: margin.marginCents,
    marginPercent: margin.marginPercent,
    lines: cost.lines,
    hasUnknownCost: cost.hasUnknownCost,
  };
}

/**
 * Custo a partir de uma receita já carregada — a versão em lote de
 * `computeUnitCost`. A fórmula é a mesma (`recipeCost`); muda só de onde vêm
 * as linhas, para N variações custarem duas consultas e não 2N.
 */
function costOf(recipe: repository.RecipeWithItems | undefined): UnitCostResult {
  if (!recipe) {
    return {
      unitCostCents: 0,
      batchCostCents: 0,
      yieldQty: 1,
      lines: [],
      hasUnknownCost: false,
      hasRecipe: false,
    };
  }

  const items = [...recipe.items].sort((a, b) => a.supplyName.localeCompare(b.supplyName, 'pt-BR'));
  const breakdown = recipeCost(toCostItems(items), recipe.yieldQty);

  return {
    unitCostCents: breakdown.unitCostCents,
    batchCostCents: breakdown.batchCostCents,
    yieldQty: recipe.yieldQty,
    lines: toCostLines(items, breakdown),
    hasUnknownCost: items.some((item) => item.costUnknown),
    hasRecipe: true,
  };
}

/**
 * Ficha técnica e custo de todas as variações de um produto.
 *
 * É o que a tela do produto "puxa": a receita de cada variação já com o
 * custo e a margem no canal padrão. Variação sem receita volta com
 * `hasRecipe: false` e custo zero — o mesmo contrato de `computeUnitCost`.
 */
export async function getProductCosting(
  tx: Transaction,
  productId: string,
): Promise<ProductCosting> {
  const variants = await repository.listVariantsOfProduct(tx, productId);
  const first = variants[0];
  if (!first) throw notFound('Produto não encontrado.');

  const [recipes, defaultChannel] = await Promise.all([
    repository.listRecipesForVariants(
      tx,
      variants.map((variant) => variant.variantId),
    ),
    repository.findDefaultSalesChannel(tx),
  ]);
  const fees = defaultChannel ? toChannelFees(defaultChannel) : NO_FEES;

  return {
    productId,
    productName: first.productName,
    stockMode: first.stockMode,
    channelName: defaultChannel?.name ?? null,
    variants: variants.map((variant) => {
      const cost = costOf(recipes.get(variant.variantId));
      const margin = channelMargin(
        { priceCents: variant.priceCents, unitCostCents: cost.unitCostCents },
        fees,
      );

      return {
        variantId: variant.variantId,
        productName: variant.productName,
        variantName: variant.variantName,
        priceCents: variant.priceCents,
        yieldQty: cost.yieldQty,
        unitCostCents: cost.unitCostCents,
        batchCostCents: cost.batchCostCents,
        marginCents: margin.marginCents,
        marginPercent: margin.marginPercent,
        lines: cost.lines,
        hasUnknownCost: cost.hasUnknownCost,
        hasRecipe: cost.hasRecipe,
        active: variant.active,
      };
    }),
  };
}

/** Resumo de custo de várias variações, para as listas. Ids desconhecidos somem. */
export async function costSummary(
  tx: Transaction,
  variantIds: string[],
): Promise<CostSummary> {
  const [contexts, recipes, defaultChannel] = await Promise.all([
    repository.findVariantContexts(tx, variantIds),
    repository.listRecipesForVariants(tx, variantIds),
    repository.findDefaultSalesChannel(tx),
  ]);
  const fees = defaultChannel ? toChannelFees(defaultChannel) : NO_FEES;

  const items: CostSummary['items'] = [];
  for (const variantId of variantIds) {
    const context = contexts.get(variantId);
    if (!context) continue;

    const cost = costOf(recipes.get(variantId));
    const margin = channelMargin(
      { priceCents: context.priceCents, unitCostCents: cost.unitCostCents },
      fees,
    );

    items.push({
      variantId,
      hasRecipe: cost.hasRecipe,
      unitCostCents: cost.unitCostCents,
      marginCents: margin.marginCents,
      marginPercent: margin.marginPercent,
      hasUnknownCost: cost.hasUnknownCost,
    });
  }

  return { items };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

export async function putRecipe(
  tx: Transaction,
  tenantId: string,
  variantId: string,
  input: PutRecipeRequest,
): Promise<Recipe> {
  await loadVariantOrThrow(tx, variantId);

  const missing = await repository.assertSuppliesExist(
    tx,
    input.items.map((item) => item.supplyId),
  );
  if (missing.length > 0) {
    throw unprocessable('Insumo não encontrado.', { supplyIds: missing });
  }

  const before = await repository.findRecipeByVariant(tx, variantId);

  const recipe = await repository.upsertRecipe(tx, {
    tenantId,
    productVariantId: variantId,
    yieldQty: input.yieldQty,
    notes: input.notes ?? null,
  });

  await repository.replaceRecipeItems(
    tx,
    tenantId,
    recipe.id,
    input.items.map((item) => ({
      supplyId: item.supplyId,
      qty: item.qty,
      wastePercent: item.wastePercent,
    })),
  );

  const saved = await getRecipe(tx, variantId);

  await recordAudit(tx, {
    tenantId,
    action: before ? 'recipe.updated' : 'recipe.created',
    entityType: 'recipe',
    entityId: recipe.id,
    before: before ? { yieldQty: before.yieldQty } : null,
    // O custo entra na auditoria porque é ele que muda a margem — e a
    // pergunta que aparece depois é sempre "quando esse produto encareceu?".
    after: {
      variantId,
      yieldQty: input.yieldQty,
      items: input.items.length,
      unitCostCents: roundCents(
        saved.items.reduce((total, line) => total + line.costCents, 0) / input.yieldQty,
      ),
    },
  });

  return saved;
}

export async function removeRecipe(
  tx: Transaction,
  tenantId: string,
  variantId: string,
): Promise<void> {
  const recipe = await repository.findRecipeByVariant(tx, variantId);
  if (!recipe) throw notFound('Este produto não tem ficha técnica.');

  await repository.deleteRecipe(tx, recipe.id);

  await recordAudit(tx, {
    tenantId,
    action: 'recipe.removed',
    entityType: 'recipe',
    entityId: recipe.id,
    before: { variantId, yieldQty: recipe.yieldQty },
  });
}

/* -------------------------------------------------------------------------- */
/* Disponibilidade derivada (D9)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Quantas unidades de cada variação dá para vender agora.
 *
 * `tracked`   → saldo da própria variação.
 * `on_demand` → o insumo que acaba primeiro define o número.
 *
 * Em lote porque o cardápio da vitrine pergunta por dezenas de variações de
 * uma vez, e a alternativa seria um N+1 na página mais acessada do sistema.
 */
export async function availabilityForVariants(
  tx: Transaction,
  variantIds: string[],
): Promise<Map<string, VariantAvailability>> {
  const output = new Map<string, VariantAvailability>();
  if (variantIds.length === 0) return output;

  const contexts = await repository.findVariantContexts(tx, variantIds);

  const trackedIds: string[] = [];
  const onDemandIds: string[] = [];
  for (const [id, context] of contexts) {
    (context.stockMode === 'tracked' ? trackedIds : onDemandIds).push(id);
  }

  if (trackedIds.length > 0) {
    const balances = await repository.findVariantBalances(tx, trackedIds);
    for (const id of trackedIds) {
      const balance = balances.get(id);
      output.set(id, {
        variantId: id,
        stockMode: 'tracked',
        availableUnits: balance ? Math.max(0, availableQty(balance)) : 0,
        limitingSupplyId: null,
        limitingSupplyName: null,
      });
    }
  }

  if (onDemandIds.length > 0) {
    const recipes = await repository.listRecipesForVariants(tx, onDemandIds);

    const supplyIds = [
      ...new Set(
        [...recipes.values()].flatMap((recipe) => recipe.items.map((item) => item.supplyId)),
      ),
    ];
    const balances = await repository.findSupplyBalances(tx, supplyIds);

    for (const id of onDemandIds) {
      const recipe = recipes.get(id);

      // Sem receita não há gargalo conhecido: o produto fica disponível, e
      // cabe ao lojista pausá-lo quando acabar.
      if (!recipe || recipe.items.length === 0) {
        output.set(id, {
          variantId: id,
          stockMode: 'on_demand',
          availableUnits: null,
          limitingSupplyId: null,
          limitingSupplyName: null,
        });
        continue;
      }

      const requirements = recipe.items.map((item) => {
        const balance = balances.get(item.supplyId) ?? { qtyOnHand: 0, qtyReserved: 0 };
        return {
          supplyId: item.supplyId,
          supplyName: item.supplyName,
          // Por UMA unidade do produto, com a perda embutida.
          qtyPerUnit: (item.qty * (1 + item.wastePercent / 100)) / recipe.yieldQty,
          supplyAvailableQty: Math.max(0, availableQty(balance)),
        };
      });

      const units = maxProducibleUnits(requirements);

      // Qual insumo está segurando — a informação que o lojista realmente
      // quer quando vê "0 disponíveis".
      const limiting = requirements.find(
        (requirement) =>
          requirement.qtyPerUnit > 0 &&
          Math.floor(requirement.supplyAvailableQty / requirement.qtyPerUnit) === units,
      );

      output.set(id, {
        variantId: id,
        stockMode: 'on_demand',
        availableUnits: Number.isFinite(units) ? units : null,
        limitingSupplyId: limiting?.supplyId ?? null,
        limitingSupplyName: limiting?.supplyName ?? null,
      });
    }
  }

  return output;
}

export async function availabilityForVariant(
  tx: Transaction,
  variantId: string,
): Promise<VariantAvailability> {
  await loadVariantOrThrow(tx, variantId);
  const map = await availabilityForVariants(tx, [variantId]);
  return map.get(variantId)!;
}

/* -------------------------------------------------------------------------- */
/* Explosão para venda — o que os kanbans reservam                             */
/* -------------------------------------------------------------------------- */

export interface SaleLineInput {
  productVariantId: string;
  qty: number;
}

export interface StockLine {
  kind: 'product_variant' | 'supply';
  refId: string;
  qty: number;
}

/**
 * O que um pedido consome de estoque.
 *
 * `tracked`   → a própria variação.
 * `on_demand` → os INSUMOS da receita, não a variação.
 *
 * A distinção importa: reservar a variação de um produto sob demanda não
 * seguraria nada (ela não tem saldo), e dois clientes conseguiriam encomendar
 * o último bolo que a farinha permite. Produto sob demanda sem receita não
 * consome nada — não há como saber o quê.
 *
 * Mora aqui porque explodir a receita exige `recipe_items`, que tem um dono
 * só. Módulos 6 e 7 chamam esta função em vez de ler a tabela.
 */
export async function stockLinesForSale(
  tx: Transaction,
  items: readonly SaleLineInput[],
): Promise<StockLine[]> {
  if (items.length === 0) return [];

  const variantIds = [...new Set(items.map((item) => item.productVariantId))];
  const contexts = await repository.findVariantContexts(tx, variantIds);
  const recipes = await repository.listRecipesForVariants(
    tx,
    variantIds.filter((id) => contexts.get(id)?.stockMode === 'on_demand'),
  );

  // Acumula por item: o mesmo insumo pode vir de dois produtos diferentes do
  // mesmo pedido, e reservar duas vezes separado travaria a linha duas vezes.
  const totals = new Map<string, StockLine>();

  const add = (kind: StockLine['kind'], refId: string, qty: number) => {
    if (qty <= 0) return;
    const key = `${kind}:${refId}`;
    const current = totals.get(key);
    if (current) current.qty += qty;
    else totals.set(key, { kind, refId, qty });
  };

  for (const item of items) {
    const context = contexts.get(item.productVariantId);
    if (!context) continue;

    if (context.stockMode === 'tracked') {
      add('product_variant', item.productVariantId, item.qty);
      continue;
    }

    const recipe = recipes.get(item.productVariantId);
    if (!recipe) continue;

    for (const ingredient of recipe.items) {
      const perUnit = (ingredient.qty * (1 + ingredient.wastePercent / 100)) / recipe.yieldQty;
      add('supply', ingredient.supplyId, perUnit * item.qty);
    }
  }

  return [...totals.values()];
}
