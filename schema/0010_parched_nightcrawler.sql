CREATE TABLE "ask_qa_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"group_name" text NOT NULL,
	"question" text NOT NULL,
	"how_to_check" text,
	"status" text NOT NULL,
	"answer" text,
	"route" text,
	"model" text,
	"seconds" numeric(8, 2),
	"tools" text[],
	"links" jsonb,
	"figures_checked" boolean,
	"flags" text,
	"human_scores" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_qa_results_status_ck" CHECK ("ask_qa_results"."status" in ('ok','flag'))
);
--> statement-breakpoint
CREATE TABLE "ask_qa_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"tenant_slug" text NOT NULL,
	"asked" integer DEFAULT 0 NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"source_file" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_log" ADD COLUMN "tokens_cached" integer;--> statement-breakpoint
ALTER TABLE "agent_log" ADD COLUMN "tokens_cache_write" integer;--> statement-breakpoint
ALTER TABLE "agent_log" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "agent_log" ADD COLUMN "source" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "ask_qa_results" ADD CONSTRAINT "ask_qa_results_run_id_ask_qa_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ask_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ask_qa_results_run_question_uniq" ON "ask_qa_results" USING btree ("run_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_qa_runs_label_ran_at_uniq" ON "ask_qa_runs" USING btree ("label","ran_at");--> statement-breakpoint
CREATE INDEX "ask_qa_runs_ran_at_idx" ON "ask_qa_runs" USING btree ("ran_at");--> statement-breakpoint
CREATE INDEX "agent_log_created_idx" ON "agent_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "agent_log" ADD CONSTRAINT "agent_log_source_ck" CHECK ("agent_log"."source" in ('live','qa','dev'));