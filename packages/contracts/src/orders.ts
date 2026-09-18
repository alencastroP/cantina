import { z } from 'zod';

import {
  cursorQuerySchema,
  deliveryStatusSchema,
  fulfillmentSchema,
  orderOriginSchema,
  paymentMethodSchema,
  phoneSchema,
  positiveCentsSchema,
  qtySchema,
  uuidSchema,
} from './common';
import { createAddressRequestSchema } from './customers';

/**
 * Pedidos de delivery (§6.7 do PLAN.md).
 *
 * D6: agregado separado das encomendas. O que os une para efeito de
 * relatório é a view `v_orders_unified`, não uma tabela compartilhada.
 */

export const orderItemSchema = z.object({
  id: uuidSchema,
  productVariantId: uuidSchema.nullable(),
  productName: z.string(),
  variantName: z.string().nullable(),
  qty: z.number(),
  unitPriceCents: positiveCentsSchema,
  /**
   * Custo congelado no momento da venda (D11).
   *
   * Ausente para quem não decide preço (`staff`): a API corta o campo na
   * resposta. Quem opera o balcão precisa do total, não da margem.
   */
  unitCostCents: positiveCentsSchema.optional(),
  totalCents: positiveCentsSchema,
  notes: z.string().nullable(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const addressSnapshotSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  reference: z.string().optional(),
});
export type AddressSnapshot = z.infer<typeof addressSnapshotSchema>;

export const deliveryOrderSchema = z.object({
  id: uuidSchema,
  code: z.number().int(),
  status: deliveryStatusSchema,
  /** Rótulo definido pela empresa para este status (D18). */
  statusLabel: z.string(),
  statusColor: z.string().nullable(),
  origin: orderOriginSchema,
  fulfillment: fulfillmentSchema,
  customerId: uuidSchema.nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  salesChannelId: uuidSchema.nullable(),
  subtotalCents: positiveCentsSchema,
  discountCents: positiveCentsSchema,
  deliveryFeeCents: positiveCentsSchema,
  totalCents: positiveCentsSchema,
  /** Ausente para `staff` — ver `unitCostCents`. */
  costCents: positiveCentsSchema.optional(),
  paymentMethod: paymentMethodSchema.nullable(),
  paymentStatus: z.enum(['pending', 'paid', 'refunded', 'canceled']),
  changeForCents: positiveCentsSchema.nullable(),
  addressSnapshot: addressSnapshotSchema.nullable(),
  notes: z.string().nullable(),
  placedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  readyAt: z.string().datetime().nullable(),
  dispatchedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  /** Pedido pendente cuja reserva de estoque expira (D14). */
  expiresAt: z.string().datetime().nullable(),
});
export type DeliveryOrder = z.infer<typeof deliveryOrderSchema>;

export const deliveryOrderDetailSchema = deliveryOrderSchema.extend({
  items: z.array(orderItemSchema),
  /** Para onde este pedido pode ir a partir daqui. */
  allowedTransitions: z.array(deliveryStatusSchema),
});
export type DeliveryOrderDetail = z.infer<typeof deliveryOrderDetailSchema>;

/* -------------------------------------------------------------------------- */
/* Criação                                                                     */
/* -------------------------------------------------------------------------- */

export const orderItemInputSchema = z.object({
  productVariantId: uuidSchema,
  qty: qtySchema,
  /**
   * Preço combinado à mão, quando o lojista dá desconto no item.
   * Omitido, usa o preço cadastrado da variação.
   */
  unitPriceCents: positiveCentsSchema.optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const orderCustomerInputSchema = z.union([
  z.object({ customerId: uuidSchema }),
  z.object({
    name: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    email: z.string().trim().email().nullable().optional(),
  }),
]);
export type OrderCustomerInput = z.infer<typeof orderCustomerInputSchema>;

export const createDeliveryOrderRequestSchema = z
  .object({
    customer: orderCustomerInputSchema,
    fulfillment: fulfillmentSchema.default('delivery'),
    items: z.array(orderItemInputSchema).min(1).max(80),
    /** Endereço já cadastrado do cliente. */
    addressId: uuidSchema.optional(),
    /** Ou um endereço avulso, para quem pede uma vez só. */
    address: createAddressRequestSchema.partial().optional(),
    deliveryFeeCents: positiveCentsSchema.default(0),
    discountCents: positiveCentsSchema.default(0),
    paymentMethod: paymentMethodSchema.optional(),
    changeForCents: positiveCentsSchema.optional(),
    salesChannelId: uuidSchema.optional(),
    origin: orderOriginSchema.default('manual'),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (value) => value.fulfillment === 'pickup' || Boolean(value.addressId ?? value.address),
    { message: 'Informe o endereço de entrega.', path: ['address'] },
  );
export type CreateDeliveryOrderRequest = z.infer<typeof createDeliveryOrderRequestSchema>;

export const updateDeliveryOrderRequestSchema = z
  .object({
    deliveryFeeCents: positiveCentsSchema.optional(),
    discountCents: positiveCentsSchema.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    address: createAddressRequestSchema.partial().optional(),
    salesChannelId: uuidSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateDeliveryOrderRequest = z.infer<typeof updateDeliveryOrderRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Transições e pagamento                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Única porta de mudança de status (invariante 5).
 *
 * `cancel` não entra aqui: ele exige motivo e tem rota própria.
 */
export const changeStatusRequestSchema = z.object({
  status: deliveryStatusSchema.exclude(['canceled']),
});
export type ChangeStatusRequest = z.infer<typeof changeStatusRequestSchema>;

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

export const registerPaymentRequestSchema = z.object({
  method: paymentMethodSchema,
  /** `refunded` quando o lojista devolve o dinheiro de um cancelamento. */
  status: z.enum(['paid', 'pending', 'refunded']).default('paid'),
  changeForCents: positiveCentsSchema.nullable().optional(),
});
export type RegisterPaymentRequest = z.infer<typeof registerPaymentRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Listagem e board                                                            */
/* -------------------------------------------------------------------------- */

export const listDeliveryOrdersQuerySchema = cursorQuerySchema.extend({
  status: deliveryStatusSchema.optional(),
  customerId: uuidSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Busca por código do pedido ou nome do cliente. */
  q: z.string().trim().min(1).max(60).optional(),
});
export type ListDeliveryOrdersQuery = z.infer<typeof listDeliveryOrdersQuerySchema>;

export const boardColumnSchema = z.object({
  status: deliveryStatusSchema,
  label: z.string(),
  color: z.string().nullable(),
  position: z.number().int(),
  /** Total na coluna, que pode passar do que veio em `orders`. */
  count: z.number().int(),
  orders: z.array(deliveryOrderSchema),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardSchema = z.object({
  columns: z.array(boardColumnSchema),
});
export type Board = z.infer<typeof boardSchema>;
