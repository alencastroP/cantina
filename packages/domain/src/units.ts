import { domainError } from './errors';

/**
 * Unidade em que o insumo é CONSUMIDO na receita.
 * Deliberadamente pequena: só três, e todas atômicas.
 */
export const USAGE_UNITS = ['g', 'ml', 'un'] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

/**
 * Unidade em que o insumo é COMPRADO.
 * As embaladas (`cx`, `pct`, `sc`, `fd`) não têm conversão fixa —
 * o lojista informa quanto vem no pacote, e é isso que vira `conversionFactor`.
 */
export const PURCHASE_UNITS = ['kg', 'g', 'l', 'ml', 'un', 'cx', 'pct', 'sc', 'fd'] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];

export const USAGE_UNIT_LABELS: Record<UsageUnit, string> = {
  g: 'grama',
  ml: 'mililitro',
  un: 'unidade',
};

export const PURCHASE_UNIT_LABELS: Record<PurchaseUnit, string> = {
  kg: 'quilo',
  g: 'grama',
  l: 'litro',
  ml: 'mililitro',
  un: 'unidade',
  cx: 'caixa',
  pct: 'pacote',
  sc: 'saco',
  fd: 'fardo',
};

const FIXED_FACTORS: Partial<Record<`${PurchaseUnit}:${UsageUnit}`, number>> = {
  'kg:g': 1000,
  'g:g': 1,
  'l:ml': 1000,
  'ml:ml': 1,
  'un:un': 1,
};

/**
 * Quantas unidades de uso cabem em 1 unidade de compra.
 * `null` = não há conversão fixa; o lojista precisa informar
 * (ex.: um pacote de 500 g de fermento → 500).
 */
export function defaultConversionFactor(
  purchaseUnit: PurchaseUnit,
  usageUnit: UsageUnit,
): number | null {
  return FIXED_FACTORS[`${purchaseUnit}:${usageUnit}`] ?? null;
}

export function assertConversionFactor(
  purchaseUnit: PurchaseUnit,
  usageUnit: UsageUnit,
  informed: number | null | undefined,
): number {
  const fixed = defaultConversionFactor(purchaseUnit, usageUnit);

  if (fixed !== null) {
    // Conversão física conhecida: ignorar um valor divergente evita
    // que um erro de digitação distorça o custo de todo o cardápio.
    return fixed;
  }

  if (informed == null || !Number.isFinite(informed) || informed <= 0) {
    throw domainError(
      'conversion_factor_required',
      `Informe quantas ${USAGE_UNIT_LABELS[usageUnit]}s vêm em 1 ${PURCHASE_UNIT_LABELS[purchaseUnit]}.`,
      { purchaseUnit, usageUnit },
    );
  }

  return informed;
}

/** Converte uma quantidade comprada para a unidade de uso do insumo. */
export function toUsageQuantity(purchaseQty: number, conversionFactor: number): number {
  if (purchaseQty <= 0) {
    throw domainError('invalid_quantity', 'A quantidade comprada precisa ser maior que zero.');
  }
  return purchaseQty * conversionFactor;
}
