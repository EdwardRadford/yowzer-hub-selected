ALTER TABLE "customers" ADD COLUMN "canonical_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "alias_confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "alias_source" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_canonical_customer_id_customers_id_fk" FOREIGN KEY ("canonical_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_tenant_canonical_idx" ON "customers" USING btree ("tenant_id","canonical_customer_id");