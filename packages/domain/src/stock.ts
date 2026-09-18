import { domainError } from './errors';

/**
 * Livro-razão de estoque (§4.6 do PLAN.md).
 *
 * Invariante 3: nada escreve `qty_on_hand` diretamente. Toda mudança é um
 * movimento, e é este arquivo que diz o que cada movimento faz com o saldo.
 */

export const STOCK_KINDS = ['product_variant', 'supply'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const MOVEMENT_TYPES = [
  'purchase',
  'production_in',
  'production_out',
  'reservation',
  'reservation_release',
  'sale',
  'adjustment',
  'loss',
  'return',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Movimentos que exigem justificativa escrita — os que não têm documento de origem. */
export const MOVEMENTS_REQUIRING_REASON: readonly MovementType[] = ['adjustment', 'loss'];

/** O único movimento cuja quantidade pode ser negativa. */
export const SIGNED_MOVEMENTS: readonly MovementType[] = ['adjustment'];

export interface StockBalance {
  qtyOnHand: number;
  qtyReserved: number;
}

export interface BalanceDelta {
  onHand: number;
  reserved: number;
}

export function availableQty(balance: StockBalance): number {
  return balance.qtyOnHand - balance.qtyReserved;
}

/**
 * O que cada tipo de movimento faz com o saldo.
 *
 * Repare em `sale`: baixa o físico E libera a reserva ao mesmo tempo.
 * É isso que converte reserva em saída sem contar a quantidade duas vezes.
 */
export function movementDelta(type: MovementType, qty: number): BalanceDelta {
  if (!SIGNED_MOVEMENTS.includes(type) && qty <= 0) {
    throw domainError('invalid_quantity', 'A quantidade do movimento precisa ser positiva.', {
      type,
      qty,
    });
  }

  switch (type) {
    case 'purchase':
    case 'production_in':
    case 'return':
      return { onHand: qty, reserved: 0 };
    case 'production_out':
    case 'loss':
      return { onHand: -qty, reserved: 0 };
    case 'reservation':
      return { onHand: 0, reserved: qty };
    case 'reservation_release':
      return { onHand: 0, reserved: -qty };
    case 'sale':
      return { onHand: -qty, reserved: -qty };
    case 'adjustment':
      return { onHand: qty, reserved: 0 };
  }
}

export interface ApplyMovementOptions {
  /** Permite o saldo ficar negativo. Só o ajuste manual do lojista usa. */
  allowNegative?: boolean;
}

export function applyMovement(
  balance: StockBalance,
  type: MovementType,
  qty: number,
  options: ApplyMovementOptions = {},
): StockBalance {
  const delta = movementDelta(type, qty);
  const next: StockBalance = {
    qtyOnHand: balance.qtyOnHand + delta.onHand,
    qtyReserved: balance.qtyReserved + delta.reserved,
  };

  const allowNegative = options.allowNegative ?? type === 'adjustment';

  if (next.qtyOnHand < 0 && !allowNegative) {
    throw domainError('insufficient_stock', 'Estoque insuficiente para este movimento.', {
      type,
      qty,
      qtyOnHand: balance.qtyOnHand,
    });
  }

  if (next.qtyReserved < 0) {
    // Liberar mais reserva do que existe indica dupla liberação —
    // o pedido foi cancelado duas vezes, ou o job de expiração correu junto.
    throw domainError('reservation_underflow', 'Não há reserva suficiente para liberar.', {
      type,
      qty,
      qtyReserved: balance.qtyReserved,
    });
  }

  return next;
}

export function assertCanReserve(balance: StockBalance, qty: number): void {
  if (qty <= 0) {
    throw domainError('invalid_quantity', 'A quantidade precisa ser maior que zero.');
  }
  if (availableQty(balance) < qty) {
    throw domainError('insufficient_stock', 'Quantidade indisponível no estoque.', {
      requested: qty,
      available: availableQty(balance),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Disponibilidade derivada da receita — produtos `on_demand` (D9)             */
/* -------------------------------------------------------------------------- */

export interface RecipeRequirement {
  supplyId: string;
  /** Quantidade do insumo por unidade do produto, já com a perda embutida. */
  qtyPerUnit: number;
  /** Disponível do insumo (físico − reservado). */
  supplyAvailableQty: number;
}

/**
 * Quantas unidades ainda dá para produzir com o insumo disponível.
 * É o gargalo: o insumo que acaba primeiro define o número.
 *
 * Produto sem receita cadastrada não tem gargalo conhecido — devolve
 * `Infinity`, e cabe a quem chama decidir (a vitrine trata como disponível).
 */
export function maxProducibleUnits(requirements: readonly RecipeRequirement[]): number {
  if (requirements.length === 0) return Number.POSITIVE_INFINITY;

  return requirements.reduce((limit, requirement) => {
    if (requirement.qtyPerUnit <= 0) return limit;
    return Math.min(limit, Math.floor(requirement.supplyAvailableQty / requirement.qtyPerUnit));
  }, Number.POSITIVE_INFINITY);
}

export type StockMode = 'tracked' | 'on_demand';

export interface AvailabilityInput {
  stockMode: StockMode;
  /** Saldo da variação. Só usado quando `stockMode === 'tracked'`. */
  balance?: StockBalance;
  /** Insumos da receita. Só usado quando `stockMode === 'on_demand'`. */
  requirements?: readonly RecipeRequirement[];
}

export function availableUnits({
  stockMode,
  balance,
  requirements,
}: AvailabilityInput): number {
  if (stockMode === 'tracked') {
    return balance ? Math.max(0, availableQty(balance)) : 0;
  }
  const producible = maxProducibleUnits(requirements ?? []);
  return producible === Number.POSITIVE_INFINITY ? producible : Math.max(0, producible);
}
