import { domainError } from './errors';

/**
 * Máquinas de estado dos dois kanbans (D18).
 *
 * Os CÓDIGOS são fixos no código porque estoque, agenda e financeiro
 * penduram efeitos neles. O que o lojista edita é só o rótulo e a cor,
 * em `order_status_labels`.
 *
 * Invariante 5 do PLAN.md: nenhuma outra parte do sistema muda status
 * sem passar por `assertTransition`.
 */

export type Fulfillment = 'delivery' | 'pickup';

export const DELIVERY_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'canceled',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const PREORDER_STATUSES = [
  'pending',
  'confirmed',
  'in_production',
  'ready',
  'completed',
  'canceled',
] as const;
export type PreorderStatus = (typeof PREORDER_STATUSES)[number];

export const DEFAULT_DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para entrega',
  completed: 'Concluído',
  canceled: 'Cancelado',
};

export const DEFAULT_PREORDER_LABELS: Record<PreorderStatus, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmada',
  in_production: 'Em produção',
  ready: 'Pronta',
  completed: 'Entregue',
  canceled: 'Cancelada',
};

/** Colunas que aparecem no board, na ordem. Terminais ficam fora. */
export const DELIVERY_BOARD_COLUMNS: readonly DeliveryStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
];

export const PREORDER_BOARD_COLUMNS: readonly PreorderStatus[] = [
  'pending',
  'confirmed',
  'in_production',
  'ready',
];

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  pending: ['confirmed', 'canceled'],
  confirmed: ['preparing', 'canceled'],
  preparing: ['ready', 'canceled'],
  ready: ['out_for_delivery', 'completed', 'canceled'],
  out_for_delivery: ['completed', 'canceled'],
  completed: [],
  canceled: [],
};

const PREORDER_TRANSITIONS: Record<PreorderStatus, readonly PreorderStatus[]> = {
  pending: ['confirmed', 'canceled'],
  confirmed: ['in_production', 'canceled'],
  in_production: ['ready', 'canceled'],
  ready: ['completed', 'canceled'],
  completed: [],
  canceled: [],
};

/* -------------------------------------------------------------------------- */
/* Efeitos colaterais de cada transição                                        */
/* -------------------------------------------------------------------------- */

export interface TransitionEffects {
  /**
   * - `commit`              reserva vira saída definitiva
   * - `release_reservation` devolve a reserva (o pedido nunca foi confirmado)
   * - `restore`             devolve ao estoque o que já tinha saído
   */
  stock: 'commit' | 'release_reservation' | 'restore' | 'none';
  /** Lançamento financeiro (D20). */
  revenue: 'recognize' | 'none';
  /** Vaga na agenda de encomendas (D10). Sempre `none` no delivery. */
  slot: 'consume' | 'release' | 'none';
}

const NO_EFFECTS: TransitionEffects = { stock: 'none', revenue: 'none', slot: 'none' };

/** Estados em que o estoque já saiu de verdade (deixou de ser reserva). */
const DELIVERY_COMMITTED: readonly DeliveryStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
];
const PREORDER_COMMITTED: readonly PreorderStatus[] = ['confirmed', 'in_production', 'ready'];

export function deliveryTransitionEffects(
  from: DeliveryStatus,
  to: DeliveryStatus,
): TransitionEffects {
  if (to === 'confirmed') return { stock: 'commit', revenue: 'none', slot: 'none' };
  if (to === 'completed') return { stock: 'none', revenue: 'recognize', slot: 'none' };
  if (to === 'canceled') {
    return {
      stock: DELIVERY_COMMITTED.includes(from) ? 'restore' : 'release_reservation',
      revenue: 'none',
      slot: 'none',
    };
  }
  return NO_EFFECTS;
}

export function preorderTransitionEffects(
  from: PreorderStatus,
  to: PreorderStatus,
): TransitionEffects {
  if (to === 'confirmed') return { stock: 'commit', revenue: 'none', slot: 'consume' };
  if (to === 'completed') return { stock: 'none', revenue: 'recognize', slot: 'none' };
  if (to === 'canceled') {
    return {
      stock: PREORDER_COMMITTED.includes(from) ? 'restore' : 'release_reservation',
      revenue: 'none',
      slot: 'release',
    };
  }
  return NO_EFFECTS;
}

/* -------------------------------------------------------------------------- */
/* Consulta e validação                                                        */
/* -------------------------------------------------------------------------- */

export function allowedDeliveryTransitions(
  status: DeliveryStatus,
  fulfillment: Fulfillment,
): readonly DeliveryStatus[] {
  const allowed = DELIVERY_TRANSITIONS[status];
  // Retirada no balcão não passa por "saiu para entrega".
  return fulfillment === 'pickup' ? allowed.filter((next) => next !== 'out_for_delivery') : allowed;
}

export function allowedPreorderTransitions(status: PreorderStatus): readonly PreorderStatus[] {
  return PREORDER_TRANSITIONS[status];
}

export function isDeliveryTerminal(status: DeliveryStatus): boolean {
  return DELIVERY_TRANSITIONS[status].length === 0;
}

export function isPreorderTerminal(status: PreorderStatus): boolean {
  return PREORDER_TRANSITIONS[status].length === 0;
}

export function assertDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  fulfillment: Fulfillment,
): TransitionEffects {
  if (!allowedDeliveryTransitions(from, fulfillment).includes(to)) {
    throw domainError(
      'invalid_status_transition',
      `Não é possível mudar de "${DEFAULT_DELIVERY_LABELS[from]}" para "${DEFAULT_DELIVERY_LABELS[to]}".`,
      { from, to, fulfillment, allowed: allowedDeliveryTransitions(from, fulfillment) },
    );
  }
  return deliveryTransitionEffects(from, to);
}

export function assertPreorderTransition(
  from: PreorderStatus,
  to: PreorderStatus,
): TransitionEffects {
  if (!allowedPreorderTransitions(from).includes(to)) {
    throw domainError(
      'invalid_status_transition',
      `Não é possível mudar de "${DEFAULT_PREORDER_LABELS[from]}" para "${DEFAULT_PREORDER_LABELS[to]}".`,
      { from, to, allowed: allowedPreorderTransitions(from) },
    );
  }
  return preorderTransitionEffects(from, to);
}
