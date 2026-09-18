import { z } from 'zod';

import {
  deliveryStatusSchema,
  paymentMethodSchema,
  percentSchema,
  positiveCentsSchema,
  preorderStatusSchema,
  uuidSchema,
} from './common';

/**
 * Configuração da empresa (§6.10 do PLAN.md).
 */

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');

export const storefrontThemeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
});

export const storeAddressSchema = z.object({
  street: z.string().trim().optional(),
  number: z.string().trim().optional(),
  complement: z.string().trim().optional(),
  neighborhood: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().length(2).optional(),
  zip: z.string().trim().optional(),
});

export const tenantSettingsSchema = z.object({
  about: z.string().nullable(),
  theme: storefrontThemeSchema,
  address: storeAddressSchema,
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),

  acceptsDelivery: z.boolean(),
  acceptsPickup: z.boolean(),
  acceptsPreorder: z.boolean(),
  acceptsOnlineCheckout: z.boolean(),
  minOrderCents: positiveCentsSchema,
  acceptedPaymentMethods: z.array(paymentMethodSchema),

  whatsappNumber: z.string().nullable(),
  whatsappMode: z.enum(['persist', 'link_only']),

  preorderLeadTimeHours: z.number().int(),
  preorderHorizonDays: z.number().int(),
  preorderDepositPercent: percentSchema,

  reservationTtlMinutes: z.number().int(),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const updateTenantSettingsRequestSchema = z
  .object({
    about: z.string().trim().max(2000).nullable().optional(),
    theme: storefrontThemeSchema.optional(),
    address: storeAddressSchema.optional(),
    contactPhone: z.string().trim().nullable().optional(),
    contactEmail: z.string().trim().email().nullable().optional(),

    acceptsDelivery: z.boolean().optional(),
    acceptsPickup: z.boolean().optional(),
    acceptsPreorder: z.boolean().optional(),
    acceptsOnlineCheckout: z.boolean().optional(),
    minOrderCents: positiveCentsSchema.optional(),
    acceptedPaymentMethods: z.array(paymentMethodSchema).min(1).optional(),

    whatsappNumber: z.string().trim().nullable().optional(),
    whatsappMode: z.enum(['persist', 'link_only']).optional(),

    /** Antecedência mínima da encomenda. Teto de 30 dias evita erro de digitação. */
    preorderLeadTimeHours: z.number().int().min(0).max(720).optional(),
    preorderHorizonDays: z.number().int().min(1).max(365).optional(),
    preorderDepositPercent: percentSchema.optional(),

    reservationTtlMinutes: z.number().int().min(5).max(1440).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateTenantSettingsRequest = z.infer<typeof updateTenantSettingsRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Horário de funcionamento                                                    */
/* -------------------------------------------------------------------------- */

export const businessHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: timeSchema,
    closesAt: timeSchema,
    scope: z.enum(['store', 'preorder']).default('store'),
  })
  .refine((value) => value.opensAt < value.closesAt, {
    message: 'O horário de fechamento precisa ser depois do de abertura.',
    path: ['closesAt'],
  });
export type BusinessHour = z.infer<typeof businessHourSchema>;

/** Substituição integral: é mais simples de raciocinar que diff por faixa. */
export const replaceBusinessHoursRequestSchema = z.object({
  hours: z.array(businessHourSchema).max(42),
});
export type ReplaceBusinessHoursRequest = z.infer<typeof replaceBusinessHoursRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Rótulos das colunas do kanban (D18)                                         */
/* -------------------------------------------------------------------------- */

export const statusLabelSchema = z.object({
  id: uuidSchema,
  flow: z.enum(['delivery', 'preorder']),
  statusCode: z.string(),
  label: z.string(),
  color: z.string().nullable(),
  position: z.number().int(),
});
export type StatusLabel = z.infer<typeof statusLabelSchema>;

/**
 * Só `label` e `color` são editáveis. `statusCode` e `position` vêm da máquina
 * de estados em `@cantina/domain` — deixar o lojista mexer neles quebraria a
 * relação entre coluna e efeito (baixa de estoque, receita reconhecida).
 */
export const updateStatusLabelsRequestSchema = z.object({
  labels: z
    .array(
      z.object({
        flow: z.enum(['delivery', 'preorder']),
        statusCode: z.union([deliveryStatusSchema, preorderStatusSchema]),
        label: z.string().trim().min(1).max(40),
        color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});
export type UpdateStatusLabelsRequest = z.infer<typeof updateStatusLabelsRequestSchema>;
