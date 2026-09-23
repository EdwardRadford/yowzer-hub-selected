CREATE TABLE "health_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"tenant_id" uuid,
	"status" text NOT NULL,
	"detail" text NOT NULL,
	"expires_at" timestamp with time zone,
	"latency_ms" integer,
	"meta" jsonb,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_results_status_ck" CHECK ("health_results"."status" in ('ok','warn','fail','skip'))
);
--> statement-breakpoint
CREATE TABLE "health_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"ok_count" integer DEFAULT 0 NOT NULL,
	"warn_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"skip_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_results" ADD CONSTRAINT "health_results_run_id_health_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."health_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_results" ADD CONSTRAINT "health_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_results_check_tenant_ran_idx" ON "health_results" USING btree ("check_id","tenant_id","ran_at");--> statement-breakpoint
CREATE INDEX "health_results_run_idx" ON "health_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "health_results_tenant_ran_idx" ON "health_results" USING btree ("tenant_id","ran_at");--> statement-breakpoint
CREATE INDEX "health_runs_started_idx" ON "health_runs" USING btree ("started_at");