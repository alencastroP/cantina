import { z } from 'zod';

import {
  dateOnlySchema,
  fulfillmentSchema,
  paymentMethodSchema,
  phoneSchema,
  positiveCentsSchema,
  qtySchema,
  slugSchema,
  uuidSchema,
} from './common';

/**
 * Vitrine pública (§6.1 do PLAN.md).
 *
 * Sem autenticação: o tenant vem do HOST (D2), resolvido pelo middleware. Os
 * tipos aqui são deliberadamente MAIS ENXUTOS que os do painel — custo,
 * margem, fornecedor e estoque interno não atravessam para o lado do cliente.
 */

/* -------------------------------------------------------------------------- */
/* Configuração da loja                                                        */
/* -------------------------------------------------------------------------- */

export const businessHourPublicSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: z.string(),
  closesAt: z.string(),
});

export const storefrontConfigSchema = z.object({
  name: z.string(),
  slug: z.string(),
  about: z.string().nullable(),
  theme: z.object({
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    logoUrl: z.string().optional(),
    coverUrl: z.string().optional(),
  }),
  address: z.record(z.string()).nullable(),
  contactPhone: z.string().nullable(),

  /** Calculado no servidor, no fuso da loja — o relógio do cliente não serve. */
  isOpenNow: z.boolean(),
  hours: z.array(businessHourPublicSchema),

  acceptsDelivery: z.boolean(),
  acceptsPickup: z.boolean(),
  acceptsPreorder: z.boolean(),
  /** `false` = a loja só recebe pedido por WhatsApp. */
  acceptsOnlineCheckout: z.boolean(),
  minOrderCents: positiveCentsSchema,
  acceptedPaymentMethods: z.array(paymentMethodSchema),

  whatsappNumber: z.string().nullable(),
  /** `persist` grava o pedido antes de abrir o WhatsApp; `link_only` não (D7). */
  whatsappMode: z.enum(['persist', 'link_only']),
});
export type StorefrontConfig = z.infer<typeof storefrontConfigSchema>;

/* -------------------------------------------------------------------------- */
/* Cardápio                                                                    */
/* -------------------------------------------------------------------------- */

export const menuVariantSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  priceCents: positiveCentsSchema,
  compareAtPriceCents: positiveCentsSchema.nullable(),
  /**
   * Quantas unidades dá para vender agora.
   * `null` = sem limite conhecido (produto sob demanda e sem ficha técnica).
   */
  availableUnits: z.number().nullable(),
});
export type MenuVariant = z.infer<typeof menuVariantSchema>;

export const menuProductSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  variants: z.array(menuVariantSchema),
  /** Todas as variações esgotadas — a vitrine mostra, mas não deixa comprar. */
  soldOut: z.boolean(),
});
export type MenuProduct = z.infer<typeof menuProductSchema>;

export const menuCategorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  products: z.array(menuProductSchema),
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const menuSchema = z.object({
  categories: z.array(menuCategorySchema),
  /** Produtos sem categoria, listados por último. */
  uncategorized: z.array(menuProductSchema),
});
export type Menu = z.infer<typeof menuSchema>;

export const menuQuerySchema = z.object({
  /** `delivery` esconde o que é exclusivo de encomenda, e vice-versa. */
  for: z.enum(['delivery', 'preorder']).default('delivery'),
});

export const productSlugParamSchema = z.object({ slug: slugSchema });

/* -------------------------------------------------------------------------- */
/* Entrega                                                                     */
/* -------------------------------------------------------------------------- */

export const deliveryZonePublicSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  neighborhood: z.string().nullable(),
  feeCents: positiveCentsSchema,
  minOrderCents: positiveCentsSchema,
  etaMinutes: z.number().int().nullable(),
});
export type DeliveryZonePublic = z.infer<typeof deliveryZonePublicSchema>;

export const deliveryQuoteRequestSchema = z.object({
  neighborhood: z.string().trim().min(2).max(80).optional(),
  zip: z.string().trim().max(12).optional(),
});
export type DeliveryQuoteRequest = z.infer<typeof deliveryQuoteRequestSchema>;

export const deliveryQuoteSchema = z.object({
  available: z.boolean(),
  zoneName: z.string().nullable(),
  feeCents: positiveCentsSchema,
  minOrderCents: positiveCentsSchema,
  etaMinutes: z.number().int().nullable(),
  /** Mensagem para quando não atendemos a região. */
  message: z.string().nullable(),
});
export type DeliveryQuote = z.infer<typeof deliveryQuoteSchema>;

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

export const storefrontItemSchema = z.object({
  productVariantId: uuidSchema,
  qty: qtySchema,
  notes: z.string().trim().max(300).optional(),
});

export const storefrontCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
});

export const storefrontAddressSchema = z.object({
  street: z.string().trim().min(3).max(160),
  number: z.string().trim().max(20).optional(),
  complement: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(160).optional(),
});

export const createStorefrontOrderRequestSchema = z
  .object({
    customer: storefrontCustomerSchema,
    fulfillment: fulfillmentSchema.default('delivery'),
    items: z.array(storefrontItemSchema).min(1).max(50),
    address: storefrontAddressSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    /** "Troco para R$ 50". Só faz sentido em dinheiro. */
    changeForCents: positiveCentsSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.fulfillment === 'pickup' || Boolean(value.address), {
    message: 'Informe o endereço de entrega.',
    path: ['address'],
  });
export type CreateStorefrontOrderRequest = z.infer<typeof createStorefrontOrderRequestSchema>;

/** O que o cliente vê depois de enviar — sem custo, sem margem, sem canal. */
export const storefrontOrderSchema = z.object({
  code: z.number().int(),
  status: z.string(),
  statusLabel: z.string(),
  fulfillment: fulfillmentSchema,
  subtotalCents: positiveCentsSchema,
  deliveryFeeCents: positiveCentsSchema,
  totalCents: positiveCentsSchema,
  paymentMethod: paymentMethodSchema.nullable(),
  placedAt: z.string().datetime(),
  items: z.array(
    z.object({
      productName: z.string(),
      variantName: z.string().nullable(),
      qty: z.number(),
      totalCents: positiveCentsSchema,
      notes: z.string().nullable(),
    }),
  ),
  /** Presente quando a loja usa WhatsApp — o cliente é levado para lá. */
  whatsappUrl: z.string().url().nullable(),
});
export type StorefrontOrder = z.infer<typeof storefrontOrderSchema>;

/**
 * O que o cliente vê de uma encomenda — igual ao pedido, mais a data combinada.
 */
export const storefrontPreorderSchema = storefrontOrderSchema.extend({
  dueDate: dateOnlySchema,
  dueTime: z.string().nullable(),
});
export type StorefrontPreorder = z.infer<typeof storefrontPreorderSchema>;

/**
 * Monta a mensagem do WhatsApp.
 *
 * Conforme `whatsappMode` da loja (D7): `persist` grava o pedido e devolve o
 * código junto do link; `link_only` só monta a mensagem, e nada é gravado.
 */
export const whatsappDraftRequestSchema = createStorefrontOrderRequestSchema;

export const whatsappDraftSchema = z.object({
  whatsappUrl: z.string().url(),
  message: z.string(),
  /** Presente só quando a loja grava o pedido antes de abrir o WhatsApp. */
  order: storefrontOrderSchema.nullable(),
});
export type WhatsappDraft = z.infer<typeof whatsappDraftSchema>;

/* -------------------------------------------------------------------------- */
/* Encomendas (D10)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Um dia da agenda, como o cliente vê.
 *
 * Deliberadamente magro: `slotsLeft` diz quanto ainda cabe, mas capacidade
 * total e quantas encomendas a loja já tem são informação de gestão.
 */
export const publicDaySchema = z.object({
  date: dateOnlySchema,
  available: z.boolean(),
  slotsLeft: z.number().int(),
  reason: z.enum(['closed', 'full', 'lead_time', 'horizon']).nullable(),
});
export type PublicDay = z.infer<typeof publicDaySchema>;

export const storefrontAvailabilityQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
});

export const createStorefrontPreorderRequestSchema = z
  .object({
    customer: storefrontCustomerSchema,
    dueDate: dateOnlySchema,
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    fulfillment: fulfillmentSchema.default('pickup'),
    items: z.array(storefrontItemSchema).min(1).max(50),
    address: storefrontAddressSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.fulfillment === 'pickup' || Boolean(value.address), {
    message: 'Informe o endereço de entrega.',
    path: ['address'],
  });
export type CreateStorefrontPreorderRequest = z.infer<
  typeof createStorefrontPreorderRequestSchema
>;

/* -------------------------------------------------------------------------- */
/* Acompanhamento                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Código + telefone, sempre os dois.
 *
 * Só o telefone permitiria a qualquer pessoa listar os pedidos de qualquer
 * número (D4: o cliente não tem senha). O código é o segredo que falta.
 */
export const trackOrderQuerySchema = z.object({
  phone: phoneSchema,
});
