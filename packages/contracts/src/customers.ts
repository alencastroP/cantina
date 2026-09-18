import { z } from 'zod';

import {
  cursorQuerySchema,
  phoneSchema,
  positiveCentsSchema,
  uuidSchema,
} from './common';

/**
 * Clientes do lojista (§6.3 do PLAN.md).
 *
 * D4: sem login. O telefone é a chave natural, única por empresa, e o
 * checkout faz find-or-create sobre ela.
 */

export const customerSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  ordersCount: z.number().int(),
  totalSpentCents: positiveCentsSchema,
  firstOrderAt: z.string().datetime().nullable(),
  lastOrderAt: z.string().datetime().nullable(),
  /** Preenchido = dados pessoais apagados a pedido (LGPD, D24). */
  anonymizedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;

export const updateCustomerRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.optional(),
    email: z.string().trim().email().nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;

export const listCustomersQuerySchema = cursorQuerySchema.extend({
  /** Busca por nome ou telefone. */
  q: z.string().trim().min(2).max(60).optional(),
  /** Ordena por quem comprou mais recentemente, em vez de por cadastro. */
  recent: z.coerce.boolean().optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Endereços                                                                   */
/* -------------------------------------------------------------------------- */

export const customerAddressSchema = z.object({
  id: uuidSchema,
  label: z.string().nullable(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  reference: z.string().nullable(),
  isDefault: z.boolean(),
});
export type CustomerAddress = z.infer<typeof customerAddressSchema>;

export const createAddressRequestSchema = z.object({
  label: z.string().trim().max(40).nullable().optional(),
  street: z.string().trim().min(3).max(160),
  number: z.string().trim().max(20).nullable().optional(),
  complement: z.string().trim().max(80).nullable().optional(),
  neighborhood: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().length(2).nullable().optional(),
  zip: z.string().trim().max(12).nullable().optional(),
  reference: z.string().trim().max(160).nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type CreateAddressRequest = z.infer<typeof createAddressRequestSchema>;

export const updateAddressRequestSchema = createAddressRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateAddressRequest = z.infer<typeof updateAddressRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Histórico                                                                   */
/* -------------------------------------------------------------------------- */

/** Vem de `v_orders_unified`: delivery e encomendas na mesma lista (D6). */
export const customerOrderSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['delivery', 'preorder']),
  code: z.number().int(),
  status: z.string(),
  fulfillment: z.string(),
  paymentStatus: z.string(),
  totalCents: positiveCentsSchema,
  placedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  /** Só encomendas. */
  dueDate: z.string().nullable(),
});
export type CustomerOrder = z.infer<typeof customerOrderSchema>;

export const customerDetailSchema = customerSchema.extend({
  addresses: z.array(customerAddressSchema),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;

/* -------------------------------------------------------------------------- */
/* LGPD (D24)                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Anonimizar, não excluir: o pedido precisa sobreviver para o histórico
 * financeiro fechar. Os dados pessoais somem do cadastro e dos endereços; o
 * pedido guarda apenas os snapshots que já tinha no momento da venda.
 */
export const anonymizeCustomerRequestSchema = z.object({
  /** Confirmação explícita: a ação é irreversível. */
  confirm: z.literal(true),
  reason: z.string().trim().max(200).optional(),
});
export type AnonymizeCustomerRequest = z.infer<typeof anonymizeCustomerRequestSchema>;
