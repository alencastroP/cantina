CREATE TABLE "trial_signup_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"tenant_id" uuid,
	"checkout_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "pending_confirmation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trial_signup_attempts" ADD CONSTRAINT "trial_signup_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trial_signup_attempts_key_uq" ON "trial_signup_attempts" USING btree ("idempotency_key");