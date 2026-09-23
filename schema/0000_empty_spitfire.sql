-- Extensions the brain relies on. pg_trgm backs the trigram customer search
-- (similarity / ilike). `vector` (pgvector, for embeddings) is added with the
-- documents slice, not here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "acceptance_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"retained_party_name" text,
	"document_kind" text NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version" text NOT NULL,
	"content_sha256" text NOT NULL,
	"content" text,
	"assent_wording" text NOT NULL,
	"auth_method" text NOT NULL,
	"actor_user_id" uuid,
	"ip" text,
	"user_agent" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acceptance_evidence_kind_ck" CHECK ("acceptance_evidence"."document_kind" in ('quote','proof','terms')),
	CONSTRAINT "acceptance_evidence_auth_ck" CHECK ("acceptance_evidence"."auth_method" in ('magic_link','password','staff_recorded'))
);
--> statement-breakpoint
CREATE TABLE "agent_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"trigger" text NOT NULL,
	"job_id" uuid,
	"input_summary" text,
	"output_summary" text,
	"confidence" numeric(4, 3),
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_gbp" numeric(12, 6) DEFAULT '0' NOT NULL,
	"duration_ms" integer,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"workflow_id" text,
	"actor" text,
	"caused_by_run_id" uuid,
	"authority_snapshot" jsonb,
	"refusal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_log_status_ck" CHECK ("agent_log"."status" in ('ok','flagged','error')),
	CONSTRAINT "agent_log_confidence_ck" CHECK ("agent_log"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"confidence" numeric(4, 3),
	"created_by_agent" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"edit_diff" jsonb,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_status_ck" CHECK ("approvals"."status" in ('pending','approved','edited','rejected')),
	CONSTRAINT "approvals_kind_ck" CHECK ("approvals"."kind" in ('quote','email','invoice','reminder','design_suggestion')),
	CONSTRAINT "approvals_confidence_ck" CHECK ("approvals"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "ask_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor" text,
	"question" text NOT NULL,
	"reply" text,
	"intent" text,
	"agent_used" text,
	"status" text NOT NULL,
	"error_text" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_log_status_ck" CHECK ("ask_log"."status" in ('answered','held','error'))
);
--> statement-breakpoint
CREATE TABLE "comms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"subject" text,
	"body" text,
	"external_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comms_direction_ck" CHECK ("comms"."direction" in ('inbound','outbound','internal')),
	CONSTRAINT "comms_channel_ck" CHECK ("comms"."channel" in ('email','whatsapp','phone','instagram','portal','sms','note'))
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"salutation" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"mobile" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_membership_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"business_name" text,
	"email" text,
	"phone" text,
	"billing_address" jsonb,
	"site_address" jsonb,
	"source" text,
	"notes" text,
	"marketing_consent" text,
	"marketing_consent_at" timestamp with time zone,
	"marketing_consent_source" text,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"folder_key" text,
	"has_data" boolean DEFAULT false NOT NULL,
	"has_data_checked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(12, 3),
	"unit_amount" numeric(12, 2),
	"line_amount" numeric(12, 2),
	"account_code" text,
	"item_code" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"job_id" uuid,
	"xero_invoice_id" text NOT NULL,
	"invoice_number" text,
	"type" text NOT NULL,
	"status" text,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"sub_total" numeric(12, 2),
	"tax_total" numeric(12, 2),
	"total" numeric(12, 2),
	"amount_paid" numeric(12, 2),
	"amount_due" numeric(12, 2),
	"currency" text,
	"reference" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_type_ck" CHECK ("invoices"."type" in ('ACCREC','ACCPAY','ACCRECCREDIT','ACCPAYCREDIT'))
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"stage_id" uuid,
	"event_type" text NOT NULL,
	"actor_user" uuid,
	"actor_ai" boolean DEFAULT false NOT NULL,
	"change" jsonb,
	"note" text,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"queue" text NOT NULL,
	"assigned_to" uuid,
	"assigned_by" uuid,
	"assigned_by_ai" boolean DEFAULT false NOT NULL,
	"parallel_group" uuid,
	"gate" text,
	"gate_cleared" boolean DEFAULT false NOT NULL,
	"gate_overridden_by" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"expected_by" timestamp with time zone,
	"blocked_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_stages_status_ck" CHECK ("job_stages"."status" in ('queued','assigned','in_progress','blocked','done','skipped'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"ref" text,
	"title" text NOT NULL,
	"description" text,
	"template_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"value_estimate" numeric(12, 2),
	"value_actual" numeric(12, 2),
	"due_date" date,
	"repeat_of" uuid,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "jobs_status_ck" CHECK ("jobs"."status" in ('open','on_hold','won','lost','complete')),
	CONSTRAINT "jobs_priority_ck" CHECK ("jobs"."priority" in ('normal','rush','urgent'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "memberships_role_ck" CHECK ("memberships"."role" in ('owner','manager','staff','professional','operator'))
);
--> statement-breakpoint
CREATE TABLE "quote_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"item_code" text,
	"item_name" text,
	"description" text,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2),
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_rate_pct" numeric(5, 2) DEFAULT '20' NOT NULL,
	"line_total" numeric(12, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"decided_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "quote_line_items_discount_pct_ck" CHECK ("quote_line_items"."discount_pct" between 0 and 100),
	CONSTRAINT "quote_line_items_tax_rate_pct_ck" CHECK ("quote_line_items"."tax_rate_pct" between 0 and 100),
	CONSTRAINT "quote_line_items_quantity_ck" CHECK ("quote_line_items"."quantity" >= 0),
	CONSTRAINT "quote_line_items_status_ck" CHECK ("quote_line_items"."status" in ('offered','accepted','declined'))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid,
	"estimate_number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"purchase_order_ref" text,
	"subtotal" numeric(12, 2),
	"tax_total" numeric(12, 2),
	"total" numeric(12, 2),
	"notes" text,
	"terms" text,
	"deposit_kind" text,
	"deposit_value" numeric(12, 2),
	"deposit_amount" numeric(12, 2),
	"deposit_computed_at" timestamp with time zone,
	"accepted_subtotal" numeric(12, 2),
	"accepted_tax_total" numeric(12, 2),
	"accepted_total" numeric(12, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotes_status_ck" CHECK ("quotes"."status" in ('draft','sent','accepted','declined')),
	CONSTRAINT "quotes_deposit_kind_ck" CHECK ("quotes"."deposit_kind" is null or "quotes"."deposit_kind" in ('percent','fixed')),
	CONSTRAINT "quotes_deposit_value_ck" CHECK ("quotes"."deposit_value" >= 0),
	CONSTRAINT "quotes_deposit_amount_ck" CHECK ("quotes"."deposit_amount" >= 0),
	CONSTRAINT "quotes_deposit_percent_range_ck" CHECK ("quotes"."deposit_kind" is distinct from 'percent' or "quotes"."deposit_value" <= 100),
	CONSTRAINT "quotes_accepted_subtotal_ck" CHECK ("quotes"."accepted_subtotal" >= 0),
	CONSTRAINT "quotes_accepted_tax_total_ck" CHECK ("quotes"."accepted_tax_total" >= 0),
	CONSTRAINT "quotes_accepted_total_ck" CHECK ("quotes"."accepted_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tenant_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"accent_hex" text DEFAULT '#E10600' NOT NULL,
	"logo_url" text,
	"industry" text,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"tone" jsonb,
	"thresholds" jsonb,
	"enabled_agents" text[],
	"monthly_token_budget_gbp" numeric(12, 2),
	"alert_at_pct" integer DEFAULT 80,
	"portal_config" jsonb,
	"targets" jsonb,
	"calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_config_status_ck" CHECK ("tenant_config"."status" in ('active','onboarding','read-only','suspended')),
	CONSTRAINT "tenant_config_alert_at_pct_ck" CHECK ("tenant_config"."alert_at_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"business_name" text,
	"business_type" text,
	"day_to_day_manager" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_format_ck" CHECK ("tenants"."slug" ~ '^[a-z0-9](-?[a-z0-9])*$')
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"error" text,
	CONSTRAINT "ingest_runs_status_ck" CHECK ("ingest_runs"."status" in ('running','ok','failed'))
);
--> statement-breakpoint
CREATE TABLE "tenant_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"credentials" jsonb,
	"config" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_integrations_kind_ck" CHECK ("tenant_integrations"."kind" in ('xero','dropbox','resend')),
	CONSTRAINT "tenant_integrations_status_ck" CHECK ("tenant_integrations"."status" in ('disconnected','connected','error'))
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"resource" text NOT NULL,
	"cursor" text,
	"message_failures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_state_source_ck" CHECK ("sync_state"."source" in ('xero'))
);
--> statement-breakpoint
CREATE TABLE "xero_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"xero_tenant_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"token_type" text,
	"connections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"kind" text NOT NULL,
	"customer_id" uuid,
	"job_id" uuid,
	"quote_id" uuid,
	"invoice_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reasoning" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"autonomy_decision" text,
	"reversibility" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_pence" integer,
	"decided_by" uuid,
	"failure_reason" text,
	"execution_result" jsonb,
	"undo_info" jsonb,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "actions_status_ck" CHECK ("actions"."status" in ('proposed','awaiting_human','approved','declined','executed','shadow_executed','undone','failed')),
	CONSTRAINT "actions_autonomy_decision_ck" CHECK ("actions"."autonomy_decision" in ('did','asked')),
	CONSTRAINT "actions_reversibility_ck" CHECK ("actions"."reversibility" in ('reversible','irreversible'))
);
--> statement-breakpoint
CREATE TABLE "agent_autonomy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_autonomy_mode_ck" CHECK ("agent_autonomy"."mode" in ('do','ask'))
);
--> statement-breakpoint
CREATE TABLE "operator_state" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_rails" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_book_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"description_sample" text NOT NULL,
	"item_code" text,
	"item_code_mixed" boolean DEFAULT false NOT NULL,
	"verb" text,
	"tokens" text[] NOT NULL,
	"basis" text NOT NULL,
	"unit_price_median" numeric(12, 2) NOT NULL,
	"unit_price_p25" numeric(12, 2) NOT NULL,
	"unit_price_p75" numeric(12, 2) NOT NULL,
	"unit_price_min" numeric(12, 2) NOT NULL,
	"unit_price_max" numeric(12, 2) NOT NULL,
	"sample_count" integer NOT NULL,
	"at_median_count" integer NOT NULL,
	"first_seen_at" date NOT NULL,
	"last_seen_at" date NOT NULL,
	"observations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_spec_detail" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'xero_archive' NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_book_entries_basis_ck" CHECK ("price_book_entries"."basis" in ('unit','lump')),
	CONSTRAINT "price_book_entries_verb_ck" CHECK ("price_book_entries"."verb" is null or "price_book_entries"."verb" in ('supply_and_fit','supply','fit','strip','design')),
	CONSTRAINT "price_book_entries_sample_count_ck" CHECK ("price_book_entries"."sample_count" >= 1),
	CONSTRAINT "price_book_entries_at_median_ck" CHECK ("price_book_entries"."at_median_count" between 0 and "price_book_entries"."sample_count"),
	CONSTRAINT "price_book_entries_price_order_ck" CHECK ("price_book_entries"."unit_price_min" > 0 and "price_book_entries"."unit_price_min" <= "price_book_entries"."unit_price_p25" and "price_book_entries"."unit_price_p25" <= "price_book_entries"."unit_price_median" and "price_book_entries"."unit_price_median" <= "price_book_entries"."unit_price_p75" and "price_book_entries"."unit_price_p75" <= "price_book_entries"."unit_price_max"),
	CONSTRAINT "price_book_entries_seen_order_ck" CHECK ("price_book_entries"."first_seen_at" <= "price_book_entries"."last_seen_at")
);
--> statement-breakpoint
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_log" ADD CONSTRAINT "agent_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_log" ADD CONSTRAINT "agent_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_log" ADD CONSTRAINT "ask_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms" ADD CONSTRAINT "comms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_actor_membership_id_memberships_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stages" ADD CONSTRAINT "job_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stages" ADD CONSTRAINT "job_stages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_repeat_of_jobs_id_fk" FOREIGN KEY ("repeat_of") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supersedes_id_quotes_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD CONSTRAINT "tenant_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy" ADD CONSTRAINT "agent_autonomy_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_state" ADD CONSTRAINT "operator_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_rails" ADD CONSTRAINT "tenant_rails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_book_entries" ADD CONSTRAINT "price_book_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acceptance_evidence_document_idx" ON "acceptance_evidence" USING btree ("tenant_id","document_kind","document_id");--> statement-breakpoint
CREATE INDEX "acceptance_evidence_customer_idx" ON "acceptance_evidence" USING btree ("tenant_id","customer_id","accepted_at");--> statement-breakpoint
CREATE INDEX "agent_log_tenant_time_idx" ON "agent_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_log_agent_idx" ON "agent_log" USING btree ("tenant_id","agent","created_at");--> statement-breakpoint
CREATE INDEX "agent_log_run_idx" ON "agent_log" USING btree ("tenant_id","workflow_id") WHERE workflow_id is not null;--> statement-breakpoint
CREATE INDEX "agent_log_caused_by_idx" ON "agent_log" USING btree ("tenant_id","caused_by_run_id") WHERE caused_by_run_id is not null;--> statement-breakpoint
CREATE INDEX "approvals_tenant_status_idx" ON "approvals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "approvals_run_idx" ON "approvals" USING btree ("tenant_id","run_id") WHERE run_id is not null;--> statement-breakpoint
CREATE INDEX "ask_log_tenant_time_idx" ON "ask_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "comms_entity_idx" ON "comms" USING btree ("tenant_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "comms_run_idx" ON "comms" USING btree ("tenant_id","run_id") WHERE run_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "comms_tenant_external_ref_uniq" ON "comms" USING btree ("tenant_id","external_ref") WHERE external_ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_events_customer_time_idx" ON "customer_events" USING btree ("tenant_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("tenant_id","email") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "customers_tenant_is_supplier_idx" ON "customers" USING btree ("tenant_id","is_supplier");--> statement-breakpoint
CREATE INDEX "customers_tenant_folder_key_idx" ON "customers" USING btree ("tenant_id","folder_key");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_adopt_folder_key_uniq" ON "customers" USING btree ("tenant_id","folder_key") WHERE source = 'dropbox_folder';--> statement-breakpoint
CREATE INDEX "invoice_line_items_tenant_invoice_idx" ON "invoice_line_items" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_xero_uniq" ON "invoices" USING btree ("tenant_id","xero_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_customer_idx" ON "invoices" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_issued_idx" ON "invoices" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_tenant_job_idx" ON "invoices" USING btree ("tenant_id","job_id") WHERE "invoices"."job_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_tenant_accrec_due_idx" ON "invoices" USING btree ("tenant_id","due_at") WHERE "invoices"."type" = 'ACCREC';--> statement-breakpoint
CREATE INDEX "job_events_job_time_idx" ON "job_events" USING btree ("tenant_id","job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_events_run_idx" ON "job_events" USING btree ("tenant_id","run_id") WHERE run_id is not null;--> statement-breakpoint
CREATE INDEX "job_stages_queue_idx" ON "job_stages" USING btree ("tenant_id","queue","status");--> statement-breakpoint
CREATE INDEX "job_stages_job_idx" ON "job_stages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_stages_assignee_idx" ON "job_stages" USING btree ("tenant_id","assigned_to","status");--> statement-breakpoint
CREATE INDEX "jobs_tenant_status_idx" ON "jobs" USING btree ("tenant_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "jobs_customer_idx" ON "jobs" USING btree ("customer_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_ref_uniq" ON "jobs" USING btree ("tenant_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_tenant_idempotency_uniq" ON "jobs" USING btree ("tenant_id","idempotency_key") WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_uniq" ON "memberships" USING btree ("tenant_id","user_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quote_line_items_quote_idx" ON "quote_line_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_line_items_declined_idx" ON "quote_line_items" USING btree ("tenant_id","quote_id") WHERE status = 'declined';--> statement-breakpoint
CREATE INDEX "quotes_job_idx" ON "quotes" USING btree ("job_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_tenant_estimate_uniq" ON "quotes" USING btree ("tenant_id","estimate_number") WHERE estimate_number IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ingest_runs_tenant_started_idx" ON "ingest_runs" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_integrations_tenant_kind_uniq" ON "tenant_integrations" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "tenant_integrations_tenant_idx" ON "tenant_integrations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_state_tenant_source_resource_uniq" ON "sync_state" USING btree ("tenant_id","source","resource");--> statement-breakpoint
CREATE INDEX "actions_tenant_status_proposed_idx" ON "actions" USING btree ("tenant_id","status","proposed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_tenant_idempotency_uniq" ON "actions" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "actions_tenant_executed_idx" ON "actions" USING btree ("tenant_id","executed_at") WHERE executed_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_autonomy_tenant_capability_uniq" ON "agent_autonomy" USING btree ("tenant_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "price_book_entries_tenant_description_uniq" ON "price_book_entries" USING btree ("tenant_id","description");--> statement-breakpoint
CREATE INDEX "price_book_entries_tokens_idx" ON "price_book_entries" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX "price_book_entries_tenant_code_idx" ON "price_book_entries" USING btree ("tenant_id","item_code");