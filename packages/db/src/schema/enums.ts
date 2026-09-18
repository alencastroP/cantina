import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enums do Postgres.
 *
 * O que vira enum: valor fechado do qual o código depende (o `switch` tem que
 * ser exaustivo). O que NÃO vira enum: qualquer lista que o lojista edita —
 * essa vira tabela. Por isso status de pedido é enum e rótulo de coluna é
 * tabela (D18).
 */

/* --- Plataforma ----------------------------------------------------------- */
export const tenantStatusEnum = pgEnum('tenant_status', [
  'trial',
  'active',
  'past_due',
  'suspended',
  'canceled',
]);

export const domainTypeEnum = pgEnum('domain_type', ['subdomain', 'custom']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'pending',
  'paid',
  'overdue',
  'canceled',
  'refunded',
]);

export const platformRoleEnum = pgEnum('platform_role', ['owner', 'support']);

/* --- Identidade do tenant ------------------------------------------------- */
export const userRoleEnum = pgEnum('user_role', ['owner', 'manager', 'staff', 'finance']);

export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'disabled']);

export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'user',
  'platform_user',
  'customer',
  'system',
]);

/* --- Configuração --------------------------------------------------------- */
export const whatsappModeEnum = pgEnum('whatsapp_mode', ['persist', 'link_only']);

export const hoursScopeEnum = pgEnum('hours_scope', ['store', 'preorder']);

export const deliveryZoneKindEnum = pgEnum('delivery_zone_kind', ['neighborhood', 'radius']);

export const orderFlowEnum = pgEnum('order_flow', ['delivery', 'preorder']);

export const notificationTypeEnum = pgEnum('notification_type', [
  'low_stock',
  'new_order',
  'new_preorder',
  'preorder_due',
  'subscription_past_due',
]);

/* --- Catálogo ------------------------------------------------------------- */
export const stockModeEnum = pgEnum('stock_mode', ['tracked', 'on_demand']);

export const productAvailabilityEnum = pgEnum('product_availability', [
  'delivery',
  'preorder',
  'both',
]);

/* --- Insumos -------------------------------------------------------------- */
export const supplyTypeEnum = pgEnum('supply_type', ['ingredient', 'packaging']);

export const usageUnitEnum = pgEnum('usage_unit', ['g', 'ml', 'un']);

export const purchaseUnitEnum = pgEnum('purchase_unit', [
  'kg',
  'g',
  'l',
  'ml',
  'un',
  'cx',
  'pct',
  'sc',
  'fd',
]);

export const salesChannelKindEnum = pgEnum('sales_channel_kind', [
  'own_storefront',
  'marketplace',
  'counter',
]);

/* --- Estoque -------------------------------------------------------------- */
export const stockKindEnum = pgEnum('stock_kind', ['product_variant', 'supply']);

export const movementTypeEnum = pgEnum('movement_type', [
  'purchase',
  'production_in',
  'production_out',
  'reservation',
  'reservation_release',
  'sale',
  'adjustment',
  'loss',
  'return',
]);

export const movementSourceEnum = pgEnum('movement_source', [
  'delivery_order',
  'preorder',
  'supply_purchase',
  'production',
  'manual',
]);

/* --- Pedidos -------------------------------------------------------------- */
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'canceled',
]);

export const preorderStatusEnum = pgEnum('preorder_status', [
  'pending',
  'confirmed',
  'in_production',
  'ready',
  'completed',
  'canceled',
]);

export const orderOriginEnum = pgEnum('order_origin', [
  'storefront_checkout',
  'storefront_whatsapp',
  'manual',
  'imported',
]);

export const fulfillmentEnum = pgEnum('fulfillment_type', ['delivery', 'pickup']);

export const paymentMethodEnum = pgEnum('payment_method', [
  'pix',
  'cash',
  'credit_card',
  'debit_card',
  'meal_voucher',
  'bank_transfer',
  'other',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'refunded',
  'canceled',
]);

/* --- Financeiro ----------------------------------------------------------- */
export const financeDirectionEnum = pgEnum('finance_direction', ['in', 'out']);

export const financeEntryStatusEnum = pgEnum('finance_entry_status', [
  'open',
  'paid',
  'overdue',
  'canceled',
]);

export const financeAccountKindEnum = pgEnum('finance_account_kind', ['cash', 'bank', 'wallet']);

export const financeSourceEnum = pgEnum('finance_source', [
  'delivery_order',
  'preorder',
  'supply_purchase',
  'subscription',
  'manual',
]);

export const recurrenceFrequencyEnum = pgEnum('recurrence_frequency', [
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'yearly',
]);
