CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'sick' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absences_kind_ck" CHECK ("absences"."kind" in ('sick','holiday','training','other')),
	CONSTRAINT "absences_range_ck" CHECK ("absences"."ends_on" >= "absences"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "invoice_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid,
	"reason" text NOT NULL,
	"note" text,
	"raised_by" uuid,
	"raised_via" text DEFAULT 'staff' NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_disputes_via_ck" CHECK ("invoice_disputes"."raised_via" in ('email','phone','portal','staff')),
	CONSTRAINT "invoice_disputes_reason_ck" CHECK (length(btrim("invoice_disputes"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"promised_for" timestamp with time zone NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_rate_limits" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_disputes" ADD CONSTRAINT "invoice_disputes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_disputes" ADD CONSTRAINT "invoice_disputes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_disputes" ADD CONSTRAINT "invoice_disputes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_promises" ADD CONSTRAINT "purchase_order_promises_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_promises" ADD CONSTRAINT "purchase_order_promises_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absences_tenant_range_idx" ON "absences" USING btree ("tenant_id","starts_on","ends_on") WHERE cancelled_at IS NULL;--> statement-breakpoint
CREATE INDEX "absences_tenant_user_idx" ON "absences" USING btree ("tenant_id","user_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_disputes_open_uniq" ON "invoice_disputes" USING btree ("tenant_id","invoice_id") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "invoice_disputes_tenant_open_idx" ON "invoice_disputes" USING btree ("tenant_id","raised_at") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "invoice_disputes_tenant_customer_idx" ON "invoice_disputes" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoice_disputes_tenant_invoice_idx" ON "invoice_disputes" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "po_promises_tenant_po_idx" ON "purchase_order_promises" USING btree ("tenant_id","po_id","created_at");--> statement-breakpoint
ALTER TABLE "public_rate_limits" ADD CONSTRAINT "public_rate_limits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_rate_limits_tenant_idx" ON "public_rate_limits" USING btree ("tenant_id");