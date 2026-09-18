import type {
  Board,
  CancelOrderRequest,
  CreateDeliveryOrderRequest,
  DeliveryOrder,
  DeliveryOrderDetail,
  RegisterPaymentRequest,
  UpdateDeliveryOrderRequest,
} from '@cantina/contracts';
import { allowedDeliveryTransitions, type DeliveryStatus } from '@cantina/domain';

import { api, newIdempotencyKey } from '../../lib/api';

/**
 * Kanban de delivery.
 *
 * `allowedDeliveryTransitions` vem de `@cantina/domain` — o MESMO módulo que
 * o servidor usa para validar. Importar o pacote compartilhado não é duplicar
 * a regra; reescrever o `switch` aqui é que seria. Se a máquina de estados
 * mudar, os botões mudam junto, sem ninguém lembrar de sincronizar.
 */
export const ordersApi = {
  board: () => api.get<Board>('/delivery-orders/board'),

  get: (id: string) => api.get<DeliveryOrderDetail>(`/delivery-orders/${id}`),

  create: (body: CreateDeliveryOrderRequest) =>
    api.post<DeliveryOrderDetail>('/delivery-orders', body, {
      // Invariante 6: rede ruim no balcão não pode virar dois pedidos.
      idempotencyKey: newIdempotencyKey(),
    }),

  update: (id: string, body: UpdateDeliveryOrderRequest) =>
    api.patch<DeliveryOrderDetail>(`/delivery-orders/${id}`, body),

  changeStatus: (id: string, status: Exclude<DeliveryStatus, 'canceled'>) =>
    api.patch<DeliveryOrderDetail>(`/delivery-orders/${id}/status`, { status }),

  cancel: (id: string, body: CancelOrderRequest) =>
    api.post<DeliveryOrderDetail>(`/delivery-orders/${id}/cancel`, body),

  registerPayment: (id: string, body: RegisterPaymentRequest) =>
    api.post<DeliveryOrderDetail>(`/delivery-orders/${id}/payment`, body),
};

/**
 * Para onde este pedido avança com um toque.
 *
 * O balcão opera com uma mão: o botão principal é o próximo passo do fluxo, e
 * o resto fica na tela de detalhe. `canceled` nunca é sugerido aqui — cancelar
 * exige motivo e não pode ser um toque acidental.
 */
export function nextStatus(order: DeliveryOrder): Exclude<DeliveryStatus, 'canceled'> | null {
  const allowed = allowedDeliveryTransitions(order.status, order.fulfillment).filter(
    (status): status is Exclude<DeliveryStatus, 'canceled'> => status !== 'canceled',
  );
  return allowed[0] ?? null;
}

export function otherTransitions(
  order: DeliveryOrder,
): Array<Exclude<DeliveryStatus, 'canceled'>> {
  return allowedDeliveryTransitions(order.status, order.fulfillment)
    .filter((status): status is Exclude<DeliveryStatus, 'canceled'> => status !== 'canceled')
    .slice(1);
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  meal_voucher: 'Vale-refeição',
  bank_transfer: 'Transferência',
  other: 'Outro',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'A receber',
  paid: 'Pago',
  refunded: 'Estornado',
  canceled: 'Cancelado',
};

export const ORIGIN_LABELS: Record<string, string> = {
  storefront_checkout: 'Vitrine',
  storefront_whatsapp: 'WhatsApp',
  manual: 'Balcão',
  imported: 'Importado',
};
