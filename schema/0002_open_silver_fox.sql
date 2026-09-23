CREATE TABLE "proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"file_ref" text NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_to" text,
	"token" text,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"changes_requested_at" timestamp with time zone,
	"changes_note" text,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proofs_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "public_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	CONSTRAINT "public_rate_limits_count_ck" CHECK ("public_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_acceptance_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_acceptance_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_acceptance_tokens" ADD CONSTRAINT "quote_acceptance_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_acceptance_tokens" ADD CONSTRAINT "quote_acceptance_tokens_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proofs_job_idx" ON "proofs" USING btree ("tenant_id","job_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "proofs_tenant_job_version_uniq" ON "proofs" USING btree ("tenant_id","job_id","version");--> statement-breakpoint
CREATE INDEX "proofs_tenant_outstanding_idx" ON "proofs" USING btree ("tenant_id","sent_at") WHERE sent_at IS NOT NULL AND approved_at IS NULL AND changes_requested_at IS NULL;--> statement-breakpoint
CREATE INDEX "quote_acceptance_tokens_quote_idx" ON "quote_acceptance_tokens" USING btree ("tenant_id","quote_id","created_at");--> statement-breakpoint
CREATE INDEX "quote_acceptance_tokens_tenant_live_idx" ON "quote_acceptance_tokens" USING btree ("tenant_id","quote_id") WHERE used_at IS NULL;