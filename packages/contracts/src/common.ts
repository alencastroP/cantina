import { z } from 'zod';

// Instala as mensagens em português antes de qualquer schema ser usado.
import './zod-pt-br';

/**
 * Blocos comuns a todos os contratos.
 *
 * Este pacote é a fonte da verdade da API (P11): a validação do Express e os
 * tipos do front saem daqui. É também o que o app mobile futuro vai consumir
 * para ter a API tipada sem copiar nada (§9 do PLAN.md).
 */

export const API_VERSION = 'v1';

export const uuidSchema = z.string().uuid();

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');

/** Dinheiro sempre em centavos inteiros (invariante 8). */
export const centsSchema = z.number().int();
export const positiveCentsSchema = z.number().int().min(0);

/** Quantidade física: até 4 casas decimais, como no banco. */
export const qtySchema = z.number().finite().positive();

export const percentSchema = z.number().min(0).max(100);

/**
 * Telefone brasileiro normalizado para E.164.
 * É a chave natural do cliente final (D4), então a normalização precisa ser
 * a mesma em todos os pontos de entrada — senão o mesmo cliente vira dois.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length >= 10 && digits.length <= 13, {
    message: 'Telefone inválido',
  })
  .transform((digits) => {
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    return `+${withCountry}`;
  });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras, números e hífens');

/* -------------------------------------------------------------------------- */
/* Paginação por cursor (invariante 9)                                         */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const cursorQuerySchema = z.object({
  /** Id do último item da página anterior. UUID v7 é ordenável no tempo (P4). */
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: uuidSchema.nullable(),
  });
}

/* -------------------------------------------------------------------------- */
/* Envelope de erro                                                            */
/* -------------------------------------------------------------------------- */

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/* -------------------------------------------------------------------------- */
/* Enums compartilhados com o banco                                            */
/* -------------------------------------------------------------------------- */

export const userRoleSchema = z.enum(['owner', 'manager', 'staff', 'finance']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const orderOriginSchema = z.enum([
  'storefront_checkout',
  'storefront_whatsapp',
  'manual',
  'imported',
]);
export type OrderOrigin = z.infer<typeof orderOriginSchema>;

export const fulfillmentSchema = z.enum(['delivery', 'pickup']);
export type Fulfillment = z.infer<typeof fulfillmentSchema>;

export const paymentMethodSchema = z.enum([
  'pix',
  'cash',
  'credit_card',
  'debit_card',
  'meal_voucher',
  'bank_transfer',
  'other',
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStatusSchema = z.enum(['pending', 'paid', 'refunded', 'canceled']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const deliveryStatusSchema = z.enum([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'canceled',
]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const preorderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'in_production',
  'ready',
  'completed',
  'canceled',
]);
export type PreorderStatus = z.infer<typeof preorderStatusSchema>;

export const stockKindSchema = z.enum(['product_variant', 'supply']);
export type StockKind = z.infer<typeof stockKindSchema>;

export const usageUnitSchema = z.enum(['g', 'ml', 'un']);
export type UsageUnit = z.infer<typeof usageUnitSchema>;

export const purchaseUnitSchema = z.enum(['kg', 'g', 'l', 'ml', 'un', 'cx', 'pct', 'sc', 'fd']);
export type PurchaseUnit = z.infer<typeof purchaseUnitSchema>;
