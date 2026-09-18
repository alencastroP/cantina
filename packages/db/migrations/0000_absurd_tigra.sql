CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'platform_user', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."delivery_zone_kind" AS ENUM('neighborhood', 'radius');--> statement-breakpoint
CREATE TYPE "public"."domain_type" AS ENUM('subdomain', 'custom');--> statement-breakpoint
CREATE TYPE "public"."finance_account_kind" AS ENUM('cash', 'bank', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."finance_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."finance_entry_status" AS ENUM('open', 'paid', 'overdue', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."finance_source" AS ENUM('delivery_order', 'preorder', 'supply_purchase', 'subscription', 'manual');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_type" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."hours_scope" AS ENUM('store', 'preorder');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."movement_source" AS ENUM('delivery_order', 'preorder', 'supply_purchase', 'production', 'manual');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('purchase', 'production_in', 'production_out', 'reservation', 'reservation_release', 'sale', 'adjustment', 'loss', 'return');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('low_stock', 'new_order', 'new_preorder', 'preorder_due', 'subscription_past_due');--> statement-breakpoint
CREATE TYPE "public"."order_flow" AS ENUM('delivery', 'preorder');--> statement-breakpoint
CREATE TYPE "public"."order_origin" AS ENUM('storefront_checkout', 'storefront_whatsapp', 'manual', 'imported');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'cash', 'credit_card', 'debit_card', 'meal_voucher', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'refunded', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('owner', 'support');--> statement-breakpoint
CREATE TYPE "public"."preorder_status" AS ENUM('pending', 'confirmed', 'in_production', 'ready', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."product_availability" AS ENUM('delivery', 'preorder', 'both');--> statement-breakpoint
CREATE TYPE "public"."purchase_unit" AS ENUM('kg', 'g', 'l', 'ml', 'un', 'cx', 'pct', 'sc', 'fd');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."sales_channel_kind" AS ENUM('own_storefront', 'marketplace', 'counter');--> statement-breakpoint
CREATE TYPE "public"."stock_kind" AS ENUM('product_variant', 'supply');--> statement-breakpoint
CREATE TYPE "public"."stock_mode" AS ENUM('tracked', 'on_demand');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."supply_type" AS ENUM('ingredient', 'packaging');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('trial', 'active', 'past_due', 'suspended', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."usage_unit" AS ENUM('g', 'ml', 'un');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'manager', 'staff', 'finance');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_mode" AS ENUM('persist', 'link_only');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "platform_role" DEFAULT 'support' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_invoice_id" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_scope_pk" PRIMARY KEY("tenant_id","scope")
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"type" "domain_type" DEFAULT 'subdomain' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"document" text,
	"status" "tenant_status" DEFAULT 'trial' NOT NULL,
	"plan_id" uuid,
	"time_zone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" "audit_actor_type" DEFAULT 'user' NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_token_id" uuid,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"scope" "hours_scope" DEFAULT 'store' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "delivery_zone_kind" DEFAULT 'neighborhood' NOT NULL,
	"neighborhood" text,
	"city" text,
	"radius_km" numeric(14, 4),
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"eta_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_labels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"flow" "order_flow" NOT NULL,
	"status_code" text NOT NULL,
	"label" text NOT NULL,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_id" uuid NOT NULL,
	"about" text,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"accepts_delivery" boolean DEFAULT true NOT NULL,
	"accepts_pickup" boolean DEFAULT true NOT NULL,
	"accepts_preorder" boolean DEFAULT true NOT NULL,
	"accepts_online_checkout" boolean DEFAULT true NOT NULL,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"accepted_payment_methods" "payment_method"[] DEFAULT '{"pix","cash","credit_card","debit_card"}' NOT NULL,
	"whatsapp_number" text,
	"whatsapp_mode" "whatsapp_mode" DEFAULT 'persist' NOT NULL,
	"preorder_lead_time_hours" integer DEFAULT 48 NOT NULL,
	"preorder_horizon_days" integer DEFAULT 60 NOT NULL,
	"preorder_deposit_percent" numeric(6, 3) DEFAULT 0 NOT NULL,
	"reservation_ttl_minutes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenant_id_pk" PRIMARY KEY("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text,
	"street" text NOT NULL,
	"number" text,
	"complement" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"zip" text,
	"reference" text,
	"lat" numeric(14, 4),
	"lng" numeric(14, 4),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"notes" text,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"first_order_at" timestamp with time zone,
	"last_order_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text DEFAULT 'Padrão' NOT NULL,
	"sku" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"compare_at_price_cents" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"stock_mode" "stock_mode" DEFAULT 'on_demand' NOT NULL,
	"available_for" "product_availability" DEFAULT 'both' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"paused_until" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supplies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "supply_type" DEFAULT 'ingredient' NOT NULL,
	"usage_unit" "usage_unit" NOT NULL,
	"avg_unit_cost" numeric(16, 6) DEFAULT 0 NOT NULL,
	"min_stock_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supply_purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supply_id" uuid NOT NULL,
	"supplier_id" uuid,
	"purchase_qty" numeric(14, 4) NOT NULL,
	"purchase_unit" "purchase_unit" NOT NULL,
	"conversion_factor" numeric(14, 4) NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"unit_cost" numeric(16, 6) NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"supply_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"waste_percent" numeric(6, 3) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"yield_qty" numeric(14, 4) DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "sales_channel_kind" DEFAULT 'own_storefront' NOT NULL,
	"commission_percent" numeric(6, 3) DEFAULT 0 NOT NULL,
	"payment_fee_percent" numeric(6, 3) DEFAULT 0 NOT NULL,
	"fixed_fee_cents" integer DEFAULT 0 NOT NULL,
	"absorbs_delivery_fee" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_cost" numeric(16, 6),
	"produced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "stock_kind" NOT NULL,
	"ref_id" uuid NOT NULL,
	"qty_on_hand" numeric(14, 4) DEFAULT 0 NOT NULL,
	"qty_reserved" numeric(14, 4) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "stock_kind" NOT NULL,
	"ref_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"qty_delta" numeric(14, 4) NOT NULL,
	"balance_after" numeric(14, 4) NOT NULL,
	"unit_cost" numeric(16, 6),
	"reason" text,
	"source" "movement_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"capacity" integer,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_variant_id" uuid,
	"product_name_snapshot" text NOT NULL,
	"variant_name_snapshot" text,
	"qty" numeric(14, 4) NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" integer NOT NULL,
	"customer_id" uuid,
	"customer_name_snapshot" text,
	"customer_phone_snapshot" text,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" "order_origin" DEFAULT 'storefront_checkout' NOT NULL,
	"fulfillment" "fulfillment_type" DEFAULT 'delivery' NOT NULL,
	"sales_channel_id" uuid,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"delivery_fee_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"payment_method" "payment_method",
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"change_for_cents" integer,
	"address_snapshot" jsonb,
	"notes" text,
	"idempotency_key" text,
	"expires_at" timestamp with time zone,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preorder_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"preorder_id" uuid NOT NULL,
	"product_variant_id" uuid,
	"product_name_snapshot" text NOT NULL,
	"variant_name_snapshot" text,
	"qty" numeric(14, 4) NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preorders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" integer NOT NULL,
	"customer_id" uuid,
	"customer_name_snapshot" text,
	"customer_phone_snapshot" text,
	"status" "preorder_status" DEFAULT 'pending' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" "order_origin" DEFAULT 'storefront_checkout' NOT NULL,
	"fulfillment" "fulfillment_type" DEFAULT 'pickup' NOT NULL,
	"sales_channel_id" uuid,
	"due_date" date NOT NULL,
	"due_time" time,
	"availability_day_id" uuid,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"delivery_fee_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"deposit_paid_at" timestamp with time zone,
	"payment_method" "payment_method",
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"change_for_cents" integer,
	"address_snapshot" jsonb,
	"notes" text,
	"idempotency_key" text,
	"expires_at" timestamp with time zone,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"production_started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "finance_account_kind" DEFAULT 'cash' NOT NULL,
	"opening_balance_cents" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"direction" "finance_direction" NOT NULL,
	"parent_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"direction" "finance_direction" NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"description" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_amount_cents" integer DEFAULT 0 NOT NULL,
	"status" "finance_entry_status" DEFAULT 'open' NOT NULL,
	"source" "finance_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"recurrence_id" uuid,
	"attachment_url" text,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_recurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"direction" "finance_direction" NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"description" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"frequency" "recurrence_frequency" DEFAULT 'monthly' NOT NULL,
	"next_due_date" date NOT NULL,
	"ends_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_labels" ADD CONSTRAINT "order_status_labels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_purchases" ADD CONSTRAINT "supply_purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_purchases" ADD CONSTRAINT "supply_purchases_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_purchases" ADD CONSTRAINT "supply_purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_days" ADD CONSTRAINT "availability_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_order_id_delivery_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."delivery_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_items" ADD CONSTRAINT "preorder_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_items" ADD CONSTRAINT "preorder_items_preorder_id_preorders_id_fk" FOREIGN KEY ("preorder_id") REFERENCES "public"."preorders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_items" ADD CONSTRAINT "preorder_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorders" ADD CONSTRAINT "preorders_availability_day_id_availability_days_id_fk" FOREIGN KEY ("availability_day_id") REFERENCES "public"."availability_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_recurrence_id_finance_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."finance_recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_recurrences" ADD CONSTRAINT "finance_recurrences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_recurrences" ADD CONSTRAINT "finance_recurrences_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_recurrences" ADD CONSTRAINT "finance_recurrences_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_uq" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_users_email_uq" ON "platform_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "subscription_invoices_tenant_idx" ON "subscription_invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscription_invoices_status_idx" ON "subscription_invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_uq" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_hostname_uq" ON "tenant_domains" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_uq" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uq" ON "webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "webhook_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_entity_idx" ON "audit_logs" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_uq" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invites_token_uq" ON "user_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_invites_tenant_email_idx" ON "user_invites" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_uq" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "business_hours_tenant_idx" ON "business_hours" USING btree ("tenant_id","scope","weekday");--> statement-breakpoint
CREATE INDEX "delivery_zones_tenant_idx" ON "delivery_zones" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "notifications_tenant_unread_idx" ON "notifications" USING btree ("tenant_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedup_uq" ON "notifications" USING btree ("tenant_id","type","entity_id") WHERE read_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_status_labels_uq" ON "order_status_labels" USING btree ("tenant_id","flow","status_code");--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_phone_uq" ON "customers" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "customers_tenant_name_idx" ON "customers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "customers_tenant_last_order_idx" ON "customers" USING btree ("tenant_id","last_order_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_slug_uq" ON "categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "categories_tenant_position_idx" ON "categories" USING btree ("tenant_id","position");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("tenant_id","product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_tenant_sku_uq" ON "product_variants" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_slug_uq" ON "products" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "products_tenant_category_idx" ON "products" USING btree ("tenant_id","category_id","position");--> statement-breakpoint
CREATE INDEX "products_tenant_active_idx" ON "products" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "supplies_tenant_idx" ON "supplies" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "supplies_tenant_name_uq" ON "supplies" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "supply_purchases_tenant_supply_idx" ON "supply_purchases" USING btree ("tenant_id","supply_id","purchased_at");--> statement-breakpoint
CREATE INDEX "supply_purchases_tenant_date_idx" ON "supply_purchases" USING btree ("tenant_id","purchased_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_items_uq" ON "recipe_items" USING btree ("tenant_id","recipe_id","supply_id");--> statement-breakpoint
CREATE INDEX "recipe_items_supply_idx" ON "recipe_items" USING btree ("tenant_id","supply_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_variant_uq" ON "recipes" USING btree ("tenant_id","product_variant_id");--> statement-breakpoint
CREATE INDEX "sales_channels_tenant_idx" ON "sales_channels" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_channels_tenant_name_uq" ON "sales_channels" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "production_entries_tenant_idx" ON "production_entries" USING btree ("tenant_id","produced_at");--> statement-breakpoint
CREATE INDEX "production_entries_variant_idx" ON "production_entries" USING btree ("tenant_id","product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_items_uq" ON "stock_items" USING btree ("tenant_id","kind","ref_id");--> statement-breakpoint
CREATE INDEX "stock_items_tenant_kind_idx" ON "stock_items" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "stock_movements_ref_idx" ON "stock_movements" USING btree ("tenant_id","kind","ref_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_source_idx" ON "stock_movements" USING btree ("tenant_id","source","source_id");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_created_idx" ON "stock_movements" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_days_uq" ON "availability_days" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "availability_days_tenant_date_idx" ON "availability_days" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_exceptions_uq" ON "availability_exceptions" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_rules_uq" ON "availability_rules" USING btree ("tenant_id","weekday");--> statement-breakpoint
CREATE INDEX "delivery_order_items_order_idx" ON "delivery_order_items" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "delivery_order_items_variant_idx" ON "delivery_order_items" USING btree ("tenant_id","product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_orders_tenant_code_uq" ON "delivery_orders" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_orders_idempotency_uq" ON "delivery_orders" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "delivery_orders_board_idx" ON "delivery_orders" USING btree ("tenant_id","status","placed_at");--> statement-breakpoint
CREATE INDEX "delivery_orders_customer_idx" ON "delivery_orders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "delivery_orders_completed_idx" ON "delivery_orders" USING btree ("tenant_id","completed_at");--> statement-breakpoint
CREATE INDEX "delivery_orders_expiring_idx" ON "delivery_orders" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "preorder_items_preorder_idx" ON "preorder_items" USING btree ("tenant_id","preorder_id");--> statement-breakpoint
CREATE INDEX "preorder_items_variant_idx" ON "preorder_items" USING btree ("tenant_id","product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preorders_tenant_code_uq" ON "preorders" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "preorders_idempotency_uq" ON "preorders" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "preorders_due_idx" ON "preorders" USING btree ("tenant_id","due_date","status");--> statement-breakpoint
CREATE INDEX "preorders_board_idx" ON "preorders" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "preorders_customer_idx" ON "preorders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "preorders_expiring_idx" ON "preorders" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "finance_accounts_tenant_idx" ON "finance_accounts" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "finance_categories_tenant_idx" ON "finance_categories" USING btree ("tenant_id","direction","active");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_categories_tenant_name_uq" ON "finance_categories" USING btree ("tenant_id","direction","name");--> statement-breakpoint
CREATE INDEX "finance_entries_cashflow_idx" ON "finance_entries" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "finance_entries_paid_idx" ON "finance_entries" USING btree ("tenant_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entries_source_uq" ON "finance_entries" USING btree ("tenant_id","source","source_id");--> statement-breakpoint
CREATE INDEX "finance_recurrences_due_idx" ON "finance_recurrences" USING btree ("tenant_id","active","next_due_date");