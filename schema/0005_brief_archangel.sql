CREATE TABLE "artwork_qc_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"proof_id" uuid,
	"file_id" uuid,
	"transcribed_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" text,
	CONSTRAINT "artwork_qc_results_one_target_ck" CHECK (("artwork_qc_results"."proof_id" IS NOT NULL AND "artwork_qc_results"."file_id" IS NULL) OR ("artwork_qc_results"."proof_id" IS NULL AND "artwork_qc_results"."file_id" IS NOT NULL)),
	CONSTRAINT "artwork_qc_results_status_ck" CHECK ("artwork_qc_results"."status" in ('ok','flagged','failed'))
);
--> statement-breakpoint
CREATE TABLE "dropbox_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"provider_path" text NOT NULL,
	"url" text,
	"size_bytes" integer,
	"source_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dropbox_documents_kind_ck" CHECK ("dropbox_documents"."kind" in ('artwork','proof','site_photo','document','supplier_invoice'))
);
--> statement-breakpoint
CREATE TABLE "calendar_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fitting_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"provider_event_id" text NOT NULL,
	"calendar_id" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_sync_provider_ck" CHECK ("calendar_sync"."provider" in ('google'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"body" text,
	"customer_id" uuid,
	"needs_reply" boolean DEFAULT false NOT NULL,
	"recording_url" text,
	"transcription" text,
	"external_ref" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replied_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_channel_ck" CHECK ("messages"."channel" in ('sms','whatsapp','voice')),
	CONSTRAINT "messages_direction_ck" CHECK ("messages"."direction" in ('inbound','outbound'))
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"invoice_id" uuid,
	"quote_id" uuid,
	"amount_pence" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"url" text NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_kind_ck" CHECK ("payment_links"."kind" in ('invoice','deposit')),
	CONSTRAINT "payment_links_provider_ck" CHECK ("payment_links"."provider" in ('stripe','gocardless')),
	CONSTRAINT "payment_links_status_ck" CHECK ("payment_links"."status" in ('pending','paid','expired')),
	CONSTRAINT "payment_links_amount_ck" CHECK ("payment_links"."amount_pence" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid,
	"payment_link_id" uuid,
	"amount_pence" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ck" CHECK ("payments"."provider" in ('stripe','gocardless')),
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount_pence" > 0)
);
--> statement-breakpoint
CREATE TABLE "twilio_numbers" (
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twilio_numbers_tenant_id_pk" PRIMARY KEY("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"address_raw" text,
	"basis" text NOT NULL,
	"source" text,
	"wording" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_channel_ck" CHECK ("consents"."channel" in ('email','sms','whatsapp')),
	CONSTRAINT "consents_basis_ck" CHECK ("consents"."basis" in ('soft_opt_in','consent','legitimate_interest','service')),
	CONSTRAINT "consents_address_ck" CHECK (length("consents"."address") > 0)
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"address_raw" text,
	"reason" text NOT NULL,
	"note" text,
	"customer_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_channel_ck" CHECK ("suppressions"."channel" in ('email','sms','whatsapp')),
	CONSTRAINT "suppressions_reason_ck" CHECK ("suppressions"."reason" in ('unsubscribed','bounced','complained','manual','never_contact')),
	CONSTRAINT "suppressions_address_ck" CHECK (length("suppressions"."address") > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"material_cost_pence" integer DEFAULT 0 NOT NULL,
	"labour_minutes" integer DEFAULT 0 NOT NULL,
	"machine_minutes" integer DEFAULT 0 NOT NULL,
	"markup_pct" numeric(6, 2) DEFAULT '45' NOT NULL,
	"minimum_pence" integer DEFAULT 0 NOT NULL,
	"rush_pct" numeric(6, 2) DEFAULT '35' NOT NULL,
	"source" text DEFAULT 'hand' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_unit_ck" CHECK ("products"."unit" in ('m2','each','linear_m','hour')),
	CONSTRAINT "products_source_ck" CHECK ("products"."source" in ('starter','hand','import')),
	CONSTRAINT "products_material_cost_ck" CHECK ("products"."material_cost_pence" >= 0),
	CONSTRAINT "products_labour_minutes_ck" CHECK ("products"."labour_minutes" >= 0),
	CONSTRAINT "products_machine_minutes_ck" CHECK ("products"."machine_minutes" >= 0),
	CONSTRAINT "products_minimum_ck" CHECK ("products"."minimum_pence" >= 0),
	CONSTRAINT "products_markup_pct_ck" CHECK ("products"."markup_pct" >= -100),
	CONSTRAINT "products_rush_pct_ck" CHECK ("products"."rush_pct" >= 0)
);
--> statement-breakpoint
CREATE TABLE "variations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"quote_id" uuid,
	"description" text NOT NULL,
	"qty_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_pence" integer DEFAULT 0 NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variations_status_ck" CHECK ("variations"."status" in ('pending','sent','approved','declined')),
	CONSTRAINT "variations_total_pence_ck" CHECK ("variations"."total_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "job_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"supplier" text,
	"invoice_number" text,
	"date" date,
	"total_pence" integer NOT NULL,
	"lines" jsonb,
	"file_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_costs_source_ck" CHECK ("job_costs"."source" in ('photo','manual'))
);
--> statement-breakpoint
CREATE TABLE "job_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text,
	"uploaded_by" uuid,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"run_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "job_files_kind_ck" CHECK ("job_files"."kind" in ('artwork','proof','site_photo','completion_photo','supplier_invoice','document')),
	CONSTRAINT "job_files_bytes_ck" CHECK ("job_files"."bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "job_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"spec" jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_specs_source_ck" CHECK ("job_specs"."source" in ('manual','parsed','ai'))
);
--> statement-breakpoint
CREATE TABLE "portal_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'gmail' NOT NULL,
	"provider_id" text NOT NULL,
	"thread_id" text,
	"from_email" text,
	"from_name" text,
	"to_emails" text,
	"subject" text,
	"snippet" text,
	"body" text,
	"received_at" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"customer_id" uuid,
	"job_id" uuid,
	"classification" text DEFAULT 'unknown' NOT NULL,
	"classified_at" timestamp with time zone,
	"extracted" jsonb,
	"handled_at" timestamp with time zone,
	"handled_by" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_messages_classification_ck" CHECK ("inbox_messages"."classification" in ('enquiry','customer_reply','supplier','noise','unknown')),
	CONSTRAINT "inbox_messages_direction_ck" CHECK ("inbox_messages"."direction" in ('in','out'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"vote" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_vote_ck" CHECK ("feedback"."vote" in ('up','down'))
);
--> statement-breakpoint
CREATE TABLE "outside_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"address" jsonb,
	"postcode" text,
	"sector" text,
	"found_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_source_ck" CHECK ("prospects"."source" in ('companies_house','planit')),
	CONSTRAINT "prospects_status_ck" CHECK ("prospects"."status" in ('new','contacted','dismissed','won'))
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reg" text NOT NULL,
	"label" text,
	"driver_user_id" uuid,
	"last_checked" timestamp with time zone,
	"tax_due" date,
	"mot_due" date,
	"make" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"expected_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid,
	"supplier_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_pence" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"expected_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"run_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_status_ck" CHECK ("purchase_orders"."status" in ('draft','sent','received','invoiced')),
	CONSTRAINT "purchase_orders_total_pence_ck" CHECK ("purchase_orders"."total_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"terms" text,
	"lead_days" integer,
	"customer_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_lead_days_ck" CHECK ("suppliers"."lead_days" is null or "suppliers"."lead_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "erasure_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"erased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid,
	"job_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"illuminated" boolean DEFAULT false NOT NULL,
	"dimensions" jsonb,
	"installed_at" timestamp with time zone,
	"warranty_until" timestamp with time zone,
	"last_inspected_at" timestamp with time zone,
	"photo_file_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_kind_ck" CHECK ("assets"."kind" in ('fascia','projecting','window','vehicle','internal','banner','lightbox','other')),
	CONSTRAINT "assets_status_ck" CHECK ("assets"."status" in ('active','removed'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" jsonb,
	"postcode" text,
	"access_notes" text,
	"contact_name" text,
	"contact_phone" text,
	"what3words" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text NOT NULL,
	"function" text,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_role_ck" CHECK ("invitations"."role" in ('owner','manager','staff','professional')),
	CONSTRAINT "invitations_function_ck" CHECK ("invitations"."function" is null or "invitations"."function" in ('fitter','design','office'))
);
--> statement-breakpoint
CREATE TABLE "member_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_deliveries_channel_ck" CHECK ("member_deliveries"."channel" in ('email','whatsapp','sms','push')),
	CONSTRAINT "member_deliveries_kind_ck" CHECK ("member_deliveries"."kind" in ('briefing','urgent')),
	CONSTRAINT "member_deliveries_status_ck" CHECK ("member_deliveries"."status" in ('sent','skipped','failed'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"stage_id" uuid,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"minutes" integer GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN NULL ELSE GREATEST(0, (EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::int) END) STORED,
	"kind" text DEFAULT 'work' NOT NULL,
	"note" text,
	"source" text DEFAULT 'clock' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_kind_ck" CHECK ("time_entries"."kind" in ('work','travel','break')),
	CONSTRAINT "time_entries_source_ck" CHECK ("time_entries"."source" in ('clock','manual','start_button')),
	CONSTRAINT "time_entries_order_ck" CHECK ("time_entries"."ended_at" is null or "time_entries"."ended_at" >= "time_entries"."started_at")
);
--> statement-breakpoint
ALTER TABLE "tenant_integrations" DROP CONSTRAINT "tenant_integrations_kind_ck";--> statement-breakpoint
ALTER TABLE "quote_acceptance_tokens" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ask_log" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "ask_log" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "sole_trader" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_contractor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_end_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD COLUMN "cis_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD COLUMN "vat_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_config" ADD COLUMN "utr" text;--> statement-breakpoint
ALTER TABLE "proofs" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "quote_acceptance_tokens" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artwork_qc_results" ADD CONSTRAINT "artwork_qc_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_qc_results" ADD CONSTRAINT "artwork_qc_results_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_qc_results" ADD CONSTRAINT "artwork_qc_results_proof_id_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proofs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_qc_results" ADD CONSTRAINT "artwork_qc_results_file_id_job_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."job_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox_documents" ADD CONSTRAINT "dropbox_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox_documents" ADD CONSTRAINT "dropbox_documents_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dropbox_documents" ADD CONSTRAINT "dropbox_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync" ADD CONSTRAINT "calendar_sync_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync" ADD CONSTRAINT "calendar_sync_fitting_id_fittings_id_fk" FOREIGN KEY ("fitting_id") REFERENCES "public"."fittings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twilio_numbers" ADD CONSTRAINT "twilio_numbers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_file_id_job_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."job_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_files" ADD CONSTRAINT "job_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_files" ADD CONSTRAINT "job_files_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_files" ADD CONSTRAINT "job_files_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_specs" ADD CONSTRAINT "job_specs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_specs" ADD CONSTRAINT "job_specs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_cache" ADD CONSTRAINT "outside_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erasure_log" ADD CONSTRAINT "erasure_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erasure_log" ADD CONSTRAINT "erasure_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_deliveries" ADD CONSTRAINT "member_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_qc_results_tenant_job_idx" ON "artwork_qc_results" USING btree ("tenant_id","job_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artwork_qc_results_tenant_proof_uniq" ON "artwork_qc_results" USING btree ("tenant_id","proof_id") WHERE proof_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "artwork_qc_results_tenant_file_uniq" ON "artwork_qc_results" USING btree ("tenant_id","file_id") WHERE file_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "dropbox_documents_tenant_job_idx" ON "dropbox_documents" USING btree ("tenant_id","job_id","created_at");--> statement-breakpoint
CREATE INDEX "dropbox_documents_tenant_kind_idx" ON "dropbox_documents" USING btree ("tenant_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dropbox_documents_tenant_path_uniq" ON "dropbox_documents" USING btree ("tenant_id","provider_path");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_sync_tenant_fitting_provider_uniq" ON "calendar_sync" USING btree ("tenant_id","fitting_id","provider");--> statement-breakpoint
CREATE INDEX "messages_tenant_needs_reply_idx" ON "messages" USING btree ("tenant_id","needs_reply","received_at") WHERE needs_reply = true;--> statement-breakpoint
CREATE INDEX "messages_tenant_customer_idx" ON "messages" USING btree ("tenant_id","customer_id","received_at");--> statement-breakpoint
CREATE INDEX "messages_tenant_received_idx" ON "messages" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tenant_external_ref_uniq" ON "messages" USING btree ("tenant_id","external_ref") WHERE external_ref is not null;--> statement-breakpoint
CREATE INDEX "payment_links_tenant_invoice_live_idx" ON "payment_links" USING btree ("tenant_id","invoice_id") WHERE invoice_id is not null and status = 'pending';--> statement-breakpoint
CREATE INDEX "payment_links_tenant_quote_idx" ON "payment_links" USING btree ("tenant_id","quote_id") WHERE quote_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_tenant_provider_ref_uniq" ON "payment_links" USING btree ("tenant_id","provider","provider_ref") WHERE provider_ref is not null;--> statement-breakpoint
CREATE INDEX "payments_tenant_invoice_idx" ON "payments" USING btree ("tenant_id","invoice_id") WHERE invoice_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tenant_provider_ref_uniq" ON "payments" USING btree ("tenant_id","provider","provider_ref") WHERE provider_ref is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_numbers_number_uniq" ON "twilio_numbers" USING btree ("number");--> statement-breakpoint
CREATE INDEX "consents_tenant_channel_address_idx" ON "consents" USING btree ("tenant_id","channel","address") WHERE withdrawn_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "consents_tenant_channel_address_live_uniq" ON "consents" USING btree ("tenant_id","channel","address") WHERE withdrawn_at IS NULL;--> statement-breakpoint
CREATE INDEX "consents_customer_idx" ON "consents" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_tenant_channel_address_uniq" ON "suppressions" USING btree ("tenant_id","channel","address");--> statement-breakpoint
CREATE INDEX "suppressions_customer_idx" ON "suppressions" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "products_tenant_active_idx" ON "products" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_name_uniq" ON "products" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "variations_job_idx" ON "variations" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "variations_tenant_status_idx" ON "variations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "variations_token_hash_uniq" ON "variations" USING btree ("token_hash") WHERE token_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "job_costs_job_idx" ON "job_costs" USING btree ("tenant_id","job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_costs_supplier_idx" ON "job_costs" USING btree ("tenant_id","supplier");--> statement-breakpoint
CREATE UNIQUE INDEX "job_costs_tenant_supplier_invoice_uniq" ON "job_costs" USING btree ("tenant_id","supplier","invoice_number") WHERE supplier IS NOT NULL AND invoice_number IS NOT NULL;--> statement-breakpoint
CREATE INDEX "job_files_job_idx" ON "job_files" USING btree ("tenant_id","job_id","created_at") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "job_files_customer_idx" ON "job_files" USING btree ("tenant_id","customer_id","created_at") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "job_files_kind_idx" ON "job_files" USING btree ("tenant_id","kind","created_at") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_files_tenant_path_uniq" ON "job_files" USING btree ("tenant_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "job_specs_tenant_job_uniq" ON "job_specs" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "portal_tokens_customer_live_idx" ON "portal_tokens" USING btree ("tenant_id","customer_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_tenant_provider_id_uniq" ON "inbox_messages" USING btree ("tenant_id","provider","provider_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_tenant_received_idx" ON "inbox_messages" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE INDEX "inbox_messages_tenant_pending_idx" ON "inbox_messages" USING btree ("tenant_id","classification","received_at") WHERE handled_at is null and direction = 'in';--> statement-breakpoint
CREATE INDEX "inbox_messages_tenant_unanswered_idx" ON "inbox_messages" USING btree ("tenant_id","received_at") WHERE answered_at is null and direction = 'in';--> statement-breakpoint
CREATE INDEX "inbox_messages_tenant_thread_idx" ON "inbox_messages" USING btree ("tenant_id","thread_id");--> statement-breakpoint
CREATE INDEX "feedback_tenant_time_idx" ON "feedback" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_tenant_target_idx" ON "feedback" USING btree ("tenant_id","target_kind","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outside_cache_tenant_key_uniq" ON "outside_cache" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_tenant_source_external_uniq" ON "prospects" USING btree ("tenant_id","source","external_id");--> statement-breakpoint
CREATE INDEX "prospects_tenant_status_idx" ON "prospects" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_tenant_reg_uniq" ON "vehicles" USING btree ("tenant_id","reg");--> statement-breakpoint
CREATE INDEX "deliveries_tenant_po_idx" ON "deliveries" USING btree ("tenant_id","po_id");--> statement-breakpoint
CREATE INDEX "deliveries_tenant_outstanding_idx" ON "deliveries" USING btree ("tenant_id","expected_at") WHERE received_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_tenant_ref_uniq" ON "purchase_orders" USING btree ("tenant_id","ref");--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_status_idx" ON "purchase_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_job_idx" ON "purchase_orders" USING btree ("tenant_id","job_id") WHERE job_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_expected_idx" ON "purchase_orders" USING btree ("tenant_id","expected_at") WHERE status in ('draft','sent') and received_at is null;--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_supplier_idx" ON "purchase_orders" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_name_uniq" ON "suppliers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_customer_idx" ON "suppliers" USING btree ("tenant_id","customer_id") WHERE customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "erasure_log_tenant_idx" ON "erasure_log" USING btree ("tenant_id","erased_at");--> statement-breakpoint
CREATE INDEX "erasure_log_customer_idx" ON "erasure_log" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "assets_tenant_customer_idx" ON "assets" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "assets_site_idx" ON "assets" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_tenant_job_uniq" ON "assets" USING btree ("tenant_id","job_id") WHERE job_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_due_inspection_idx" ON "assets" USING btree ("tenant_id","last_inspected_at") WHERE illuminated = true AND status = 'active';--> statement-breakpoint
CREATE INDEX "sites_customer_idx" ON "sites" USING btree ("tenant_id","customer_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "sites_tenant_postcode_idx" ON "sites" USING btree ("tenant_id","postcode") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uniq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_tenant_email_open_uniq" ON "invitations" USING btree ("tenant_id","email") WHERE accepted_at IS NULL AND revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "member_deliveries_tenant_user_kind_idx" ON "member_deliveries" USING btree ("tenant_id","user_id","kind","sent_at");--> statement-breakpoint
CREATE INDEX "member_deliveries_tenant_sent_idx" ON "member_deliveries" USING btree ("tenant_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uniq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_tenant_user_idx" ON "push_subscriptions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "time_entries_tenant_job_idx" ON "time_entries" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "time_entries_tenant_user_started_idx" ON "time_entries" USING btree ("tenant_id","user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_open_per_user_uniq" ON "time_entries" USING btree ("tenant_id","user_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "ask_log_conversation_idx" ON "ask_log" USING btree ("tenant_id","actor","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "actions_tenant_assigned_idx" ON "actions" USING btree ("tenant_id","assigned_to","proposed_at") WHERE status = 'awaiting_human';--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_token_hash_unique" UNIQUE("token_hash");--> statement-breakpoint
ALTER TABLE "quote_acceptance_tokens" ADD CONSTRAINT "quote_acceptance_tokens_token_hash_unique" UNIQUE("token_hash");--> statement-breakpoint
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_kind_ck" CHECK ("tenant_integrations"."kind" in ('xero','dropbox','resend','google','microsoft'));
--> statement-breakpoint
-- ===========================================================================
-- HAND-WRITTEN TAIL — the three things drizzle-kit cannot express, appended by
-- the integrator (2026-09-03) so this ONE file is the whole truth about the
-- change. Everything above is generated; everything below is here because
-- Drizzle's schema DSL has no way to say it.
--
--   1. pgcrypto, for the digest() the backfill below needs.
--   2. THE TOKEN BACKFILL. `quote_acceptance_tokens.token` and `proofs.token`
--      used to hold the RAW token; they now hold nothing and `token_hash`
--      holds sha256 hex of it. Without these four statements, every live
--      "Accept" and "Approve proof" link a customer already has in their inbox
--      stops resolving the moment this migration lands — the lookup hashes the
--      candidate and finds no row. This is the only data-touching statement in
--      the file and it is additive: it fills token_hash FROM token, then nulls
--      token. Idempotent (both halves are guarded on IS NULL / IS NOT NULL).
--   3. THE TRIGRAM INDEXES. gin (col gin_trgm_ops) has no Drizzle equivalent;
--      customers.ts's similarity() search, the importer's fuzzy match and the
--      estimator's product lookup all scan without them.
--
-- Nothing above this line drops a table, drops a column, or narrows a type.
-- The two statements that read as destructive are not: the DROP CONSTRAINT on
-- tenant_integrations_kind_ck is re-added, widened, at the bottom of the
-- generated section, and quote_acceptance_tokens.token DROP NOT NULL loosens a
-- constraint rather than tightening one.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
UPDATE "quote_acceptance_tokens" SET "token_hash" = encode(digest("token", 'sha256'), 'hex') WHERE "token_hash" IS NULL AND "token" IS NOT NULL;
--> statement-breakpoint
UPDATE "quote_acceptance_tokens" SET "token" = NULL WHERE "token" IS NOT NULL AND "token_hash" IS NOT NULL;
--> statement-breakpoint
UPDATE "proofs" SET "token_hash" = encode(digest("token", 'sha256'), 'hex') WHERE "token_hash" IS NULL AND "token" IS NOT NULL;
--> statement-breakpoint
UPDATE "proofs" SET "token" = NULL WHERE "token" IS NOT NULL AND "token_hash" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx" ON "customers" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_business_name_trgm_idx" ON "customers" USING gin ("business_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);
