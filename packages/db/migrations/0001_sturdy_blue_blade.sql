CREATE TABLE "calendar_reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"date" date NOT NULL,
	"time" time,
	"assignee_user_id" uuid,
	"created_by_user_id" uuid,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_reminders" ADD CONSTRAINT "calendar_reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_reminders" ADD CONSTRAINT "calendar_reminders_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_reminders" ADD CONSTRAINT "calendar_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_reminders_date_idx" ON "calendar_reminders" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "calendar_reminders_assignee_idx" ON "calendar_reminders" USING btree ("tenant_id","assignee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_invoices_provider_uq" ON "subscription_invoices" USING btree ("provider_invoice_id");