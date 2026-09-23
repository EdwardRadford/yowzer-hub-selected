CREATE TABLE "fittings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"booking_ref" text NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone,
	"fitter_user_id" uuid,
	"site_address" jsonb,
	"notes" text,
	"status" text DEFAULT 'booked' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fittings_status_ck" CHECK ("fittings"."status" in ('booked','done','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_kind_pk" PRIMARY KEY("tenant_id","kind")
);
--> statement-breakpoint
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fittings_tenant_ref_uniq" ON "fittings" USING btree ("tenant_id","booking_ref");--> statement-breakpoint
CREATE INDEX "fittings_tenant_start_idx" ON "fittings" USING btree ("tenant_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "fittings_fitter_start_idx" ON "fittings" USING btree ("tenant_id","fitter_user_id","scheduled_start") WHERE status <> 'cancelled';