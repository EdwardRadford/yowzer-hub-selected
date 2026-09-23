CREATE TABLE "customer_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"folder_key" text NOT NULL,
	"display_name" text NOT NULL,
	"doc_count" integer DEFAULT 0 NOT NULL,
	"path_prefix" text NOT NULL,
	"is_own_folder" boolean DEFAULT false NOT NULL,
	"sample_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_modified_at" timestamp with time zone,
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_folders" ADD CONSTRAINT "customer_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_folders" ADD CONSTRAINT "customer_folders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_folders_tenant_folder_key_uniq" ON "customer_folders" USING btree ("tenant_id","folder_key");--> statement-breakpoint
CREATE INDEX "customer_folders_tenant_display_name_idx" ON "customer_folders" USING btree ("tenant_id","display_name");--> statement-breakpoint
CREATE INDEX "customer_folders_customer_idx" ON "customer_folders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_folders_display_name_trgm_idx" ON "customer_folders" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customer_folders_folder_key_trgm_idx" ON "customer_folders" USING gin ("folder_key" gin_trgm_ops);