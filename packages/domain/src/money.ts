/**
 * Dinheiro (invariante 8 do PLAN.md).
 *
 * Duas representações, deliberadamente distintas:
 *
 * - `Cents`     — inteiro. Tudo que é exibido, cobrado ou somado num pedido.
 * - `UnitCost`  — decimal com 6 casas, em centavos. Custo por unidade de USO
 *                 de um insumo (centavos por grama, por ml, por unidade).
 *                 Precisa de fração: 1 g de farinha custa 0,2 centavo.
 *
 * A fronteira entre as duas é sempre explícita, via `unitCostToCents`.
 * Nunca deixe um `UnitCost` chegar a um total de pedido sem passar por lá.
 */

export type Cents = number;
export type UnitCost = number;

export const UNIT_COST_SCALE = 6;

export function isCents(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

export function assertCents(value: number, field = 'valor'): Cents {
  if (!isCents(value)) {
    throw new TypeError(`${field} precisa ser um inteiro em centavos, recebido: ${value}`);
  }
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((total, value) => total + value, 0);
}

/** Arredonda meio-para-cima, simétrico para negativos (padrão contábil brasileiro). */
export function roundCents(value: number): Cents {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function roundUnitCost(value: number): UnitCost {
  const factor = 10 ** UNIT_COST_SCALE;
  return Math.round(value * factor) / factor;
}

/** Converte custo unitário (centavos fracionários) × quantidade em centavos inteiros. */
export function unitCostToCents(unitCost: UnitCost, quantity: number): Cents {
  return roundCents(unitCost * quantity);
}

/** Aplica um percentual (0-100) sobre um valor em centavos. */
export function percentOfCents(value: Cents, percent: number): Cents {
  return roundCents((value * percent) / 100);
}

export function formatBRL(value: Cents): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

/** Aceita "12,50", "12.50", "R$ 12,50" e devolve centavos. Entrada de formulário. */
export function parseBRL(input: string): Cents {
  const normalized = input
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Valor monetário inválido: ${input}`);
  }
  return roundCents(parsed * 100);
}
