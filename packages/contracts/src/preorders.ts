import { z } from 'zod';

import {
  cursorQuerySchema,
  dateOnlySchema,
  fulfillmentSchema,
  orderOriginSchema,
  paymentMethodSchema,
  positiveCentsSchema,
  preorderStatusSchema,
  uuidSchema,
} from './common';
import { createAddressRequestSchema } from './customers';
import { orderCustomerInputSchema, orderItemInputSchema, addressSnapshotSchema } from './orders';

/**
 * Encomendas e agenda (§6.8 do PLAN.md).
 *
 * D6: agregado separado do delivery. O que difere de verdade é `dueDate`, a
 * vaga na agenda e o sinal — nenhum dos três existe num pedido de entrega, e
 * os três participam de transações diferentes.
 */

/* -------------------------------------------------------------------------- */
/* Agenda                                                                      */
/* -------------------------------------------------------------------------- */

export const availabilityRuleSchema = z.object({
  /** 0 = domingo … 6 = sábado. */
  weekday: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  /** Encomendas aceitas neste dia da semana. */
  capacity: z.number().int().min(0).max(999),
});
export type AvailabilityRule = z.infer<typeof availabilityRuleSchema>;

/** Substituição integral: a tela edita a semana inteira de uma vez. */
export const putAvailabilityRulesRequestSchema = z.object({
  rules: z.array(availabilityRuleSchema).length(7),
});
export type PutAvailabilityRulesRequest = z.infer<typeof putAvailabilityRulesRequestSchema>;

export const availabilityExceptionSchema = z.object({
  id: uuidSchema,
  date: dateOnlySchema,
  isOpen: z.boolean(),
  /** `null` mantém a capacidade da regra semanal. */
  capacity: z.number().int().min(0).max(999).nullable(),
  reason: z.string().nullable(),
});
export type AvailabilityException = z.infer<typeof availabilityExceptionSchema>;

export const createExceptionRequestSchema = z.object({
  date: dateOnlySchema,
  isOpen: z.boolean().default(false),
  capacity: z.number().int().min(0).max(999).nullable().optional(),
  reason: z.string().trim().max(120).nullable().optional(),
});
export type CreateExceptionRequest = z.infer<typeof createExceptionRequestSchema>;

export const dayAvailabilitySchema = z.object({
  date: dateOnlySchema,
  weekday: z.number().int(),
  isOpen: z.boolean(),
  capacity: z.number().int(),
  taken: z.number().int(),
  slotsLeft: z.number().int(),
  available: z.boolean(),
  /** `closed` · `full` · `lead_time` · `horizon` */
  reason: z.enum(['closed', 'full', 'lead_time', 'horizon']).nullable(),
  exceptionReason: z.string().nullable(),
});
export type DayAvailability = z.infer<typeof dayAvailabilitySchema>;

export const availabilityRangeQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
});

/* -------------------------------------------------------------------------- */
/* Encomendas                                                                  */
/* -------------------------------------------------------------------------- */

export const preorderSchema = z.object({
  id: uuidSchema,
  code: z.number().int(),
  status: preorderStatusSchema,
  statusLabel: z.string(),
  statusColor: z.string().nullable(),
  origin: orderOriginSchema,
  fulfillment: fulfillmentSchema,
  customerId: uuidSchema.nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  /** Data combinada. É um dia de calendário, não um instante (P5). */
  dueDate: dateOnlySchema,
  dueTime: z.string().nullable(),
  subtotalCents: positiveCentsSchema,
  discountCents: positiveCentsSchema,
  deliveryFeeCents: positiveCentsSchema,
  totalCents: positiveCentsSchema,
  /** Ausente para `staff`: custo é informação de quem decide preço. */
  costCents: positiveCentsSchema.optional(),
  depositCents: positiveCentsSchema,
  depositPaidAt: z.string().datetime().nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  paymentStatus: z.enum(['pending', 'paid', 'refunded', 'canceled']),
  addressSnapshot: addressSnapshotSchema.nullable(),
  notes: z.string().nullable(),
  placedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  readyAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type Preorder = z.infer<typeof preorderSchema>;

export const preorderDetailSchema = preorderSchema.extend({
  items: z.array(
    z.object({
      id: uuidSchema,
      productVariantId: uuidSchema.nullable(),
      productName: z.string(),
      variantName: z.string().nullable(),
      qty: z.number(),
      unitPriceCents: positiveCentsSchema,
      unitCostCents: positiveCentsSchema.optional(),
      totalCents: positiveCentsSchema,
      notes: z.string().nullable(),
    }),
  ),
  allowedTransitions: z.array(preorderStatusSchema),
});
export type PreorderDetail = z.infer<typeof preorderDetailSchema>;

export const createPreorderRequestSchema = z
  .object({
    customer: orderCustomerInputSchema,
    dueDate: dateOnlySchema,
    /** Horário combinado de retirada. Informativo nesta versão. */
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    fulfillment: fulfillmentSchema.default('pickup'),
    items: z.array(orderItemInputSchema).min(1).max(80),
    addressId: uuidSchema.optional(),
    address: createAddressRequestSchema.partial().optional(),
    deliveryFeeCents: positiveCentsSchema.default(0),
    discountCents: positiveCentsSchema.default(0),
    depositCents: positiveCentsSchema.default(0),
    paymentMethod: paymentMethodSchema.optional(),
    salesChannelId: uuidSchema.optional(),
    origin: orderOriginSchema.default('manual'),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (value) => value.fulfillment === 'pickup' || Boolean(value.addressId ?? value.address),
    { message: 'Informe o endereço de entrega.', path: ['address'] },
  );
export type CreatePreorderRequest = z.infer<typeof createPreorderRequestSchema>;

export const updatePreorderRequestSchema = z
  .object({
    dueDate: dateOnlySchema.optional(),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    deliveryFeeCents: positiveCentsSchema.optional(),
    discountCents: positiveCentsSchema.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdatePreorderRequest = z.infer<typeof updatePreorderRequestSchema>;

export const changePreorderStatusRequestSchema = z.object({
  status: preorderStatusSchema.exclude(['canceled']),
});

export const registerDepositRequestSchema = z.object({
  amountCents: positiveCentsSchema,
  method: paymentMethodSchema,
});
export type RegisterDepositRequest = z.infer<typeof registerDepositRequestSchema>;

export const listPreordersQuerySchema = cursorQuerySchema.extend({
  status: preorderStatusSchema.optional(),
  customerId: uuidSchema.optional(),
  dueFrom: dateOnlySchema.optional(),
  dueTo: dateOnlySchema.optional(),
  q: z.string().trim().min(1).max(60).optional(),
});
export type ListPreordersQuery = z.infer<typeof listPreordersQuerySchema>;

export const preorderBoardColumnSchema = z.object({
  status: preorderStatusSchema,
  label: z.string(),
  color: z.string().nullable(),
  position: z.number().int(),
  count: z.number().int(),
  orders: z.array(preorderSchema),
});

export const preorderBoardSchema = z.object({
  columns: z.array(preorderBoardColumnSchema),
});
export type PreorderBoard = z.infer<typeof preorderBoardSchema>;

/* -------------------------------------------------------------------------- */
/* Calendário                                                                  */
/* -------------------------------------------------------------------------- */

export const calendarDaySchema = z.object({
  date: dateOnlySchema,
  capacity: z.number().int(),
  used: z.number().int(),
  reserved: z.number().int(),
  /** As encomendas daquele dia, para a célula do calendário mostrar. */
  preorders: z.array(
    z.object({
      id: uuidSchema,
      code: z.number().int(),
      customerName: z.string().nullable(),
      status: preorderStatusSchema,
      totalCents: positiveCentsSchema,
      /** `HH:MM` combinado, quando houver. */
      dueTime: z.string().nullable(),
    }),
  ),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

export const calendarQuerySchema = z.object({
  /** `AAAA-MM`. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const calendarSchema = z.object({
  month: z.string(),
  days: z.array(calendarDaySchema),
});
export type Calendar = z.infer<typeof calendarSchema>;
