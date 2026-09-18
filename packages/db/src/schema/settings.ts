import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { money, percent, primaryId, qty, timestamps } from './_columns';
import { tenantId } from './_tenant';
import {
  deliveryZoneKindEnum,
  hoursScopeEnum,
  notificationTypeEnum,
  orderFlowEnum,
  paymentMethodEnum,
  whatsappModeEnum,
} from './enums';
import { tenants } from './platform';

/** Configuração da empresa (§4.2 do PLAN.md). */

export interface StorefrontTheme {
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  coverUrl?: string;
}

export interface StoreAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    tenantId: tenantId(),

    /* --- Vitrine --- */
    about: text('about'),
    theme: jsonb('theme').$type<StorefrontTheme>().notNull().default({}),
    address: jsonb('address').$type<StoreAddress>().notNull().default({}),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),

    /* --- Canais de pedido --- */
    acceptsDelivery: boolean('accepts_delivery').notNull().default(true),
    acceptsPickup: boolean('accepts_pickup').notNull().default(true),
    acceptsPreorder: boolean('accepts_preorder').notNull().default(true),
    /** Checkout direto na vitrine. Desligado, a loja só recebe por WhatsApp. */
    acceptsOnlineCheckout: boolean('accepts_online_checkout').notNull().default(true),
    minOrderCents: money('min_order_cents'),
    acceptedPaymentMethods: paymentMethodEnum('accepted_payment_methods')
      .array()
      .notNull()
      .default(['pix', 'cash', 'credit_card', 'debit_card']),

    /* --- WhatsApp (D7) --- */
    whatsappNumber: text('whatsapp_number'),
    /**
     * `persist`   — grava o pedido antes de abrir o WhatsApp: entra no kanban,
     *               reserva estoque e conta no relatório.
     * `link_only` — só monta a mensagem; nada é gravado.
     */
    whatsappMode: whatsappModeEnum('whatsapp_mode').notNull().default('persist'),

    /* --- Encomendas (D10) --- */
    preorderLeadTimeHours: integer('preorder_lead_time_hours').notNull().default(48),
    preorderHorizonDays: integer('preorder_horizon_days').notNull().default(60),
    preorderDepositPercent: percent('preorder_deposit_percent').notNull().default(0),

    /* --- Reserva de estoque (D14) --- */
    /** Depois disto, o job devolve a reserva de um pedido nunca confirmado. */
    reservationTtlMinutes: integer('reservation_ttl_minutes').notNull().default(60),

    ...timestamps(),
  },
  (table) => [primaryKey({ columns: [table.tenantId] })],
);

export const businessHours = pgTable(
  'business_hours',
  {
    id: primaryId(),
    tenantId: tenantId(),
    /** 0 = domingo … 6 = sábado. */
    weekday: integer('weekday').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
    /** `store` = vitrine aberta agora; `preorder` = janela de retirada. */
    scope: hoursScopeEnum('scope').notNull().default('store'),
    ...timestamps(),
  },
  (table) => [index('business_hours_tenant_idx').on(table.tenantId, table.scope, table.weekday)],
);

export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: primaryId(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    kind: deliveryZoneKindEnum('kind').notNull().default('neighborhood'),
    neighborhood: text('neighborhood'),
    city: text('city'),
    radiusKm: qty('radius_km'),
    feeCents: money('fee_cents'),
    minOrderCents: money('min_order_cents'),
    etaMinutes: integer('eta_minutes'),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
  },
  (table) => [index('delivery_zones_tenant_idx').on(table.tenantId, table.active)],
);

/**
 * Rótulo e cor de cada coluna do kanban (D18).
 *
 * `status_code` é o código FIXO da máquina de estados em `@cantina/domain`.
 * Esta tabela só decora — ela não pode criar, remover nem reordenar estados,
 * o que é justamente o que mantém estoque e financeiro confiáveis.
 */
export const orderStatusLabels = pgTable(
  'order_status_labels',
  {
    id: primaryId(),
    tenantId: tenantId(),
    flow: orderFlowEnum('flow').notNull(),
    statusCode: text('status_code').notNull(),
    label: text('label').notNull(),
    color: text('color'),
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('order_status_labels_uq').on(table.tenantId, table.flow, table.statusCode),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    tenantId: tenantId(),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamps().createdAt,
  },
  (table) => [
    index('notifications_tenant_unread_idx').on(table.tenantId, table.readAt, table.createdAt),
    // Índice parcial: só UM alerta aberto por entidade. Evita que o job de
    // estoque baixo repita o mesmo aviso a cada varredura; depois de lido,
    // um novo alerta pode ser criado.
    uniqueIndex('notifications_dedup_uq')
      .on(table.tenantId, table.type, table.entityId)
      .where(sql`read_at is null`),
  ],
);

/* --- Relações ------------------------------------------------------------- */

export const tenantSettingsRelations = relations(tenantSettings, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantSettings.tenantId], references: [tenants.id] }),
}));
