ALTER TABLE "tenants" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_custom_domain_unique" UNIQUE("custom_domain");