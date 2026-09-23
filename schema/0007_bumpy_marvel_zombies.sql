CREATE TABLE "briefing_cache" (
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seat" text NOT NULL,
	"composed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	"v7" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefing_cache" ADD CONSTRAINT "briefing_cache_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_cache" ADD CONSTRAINT "briefing_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "briefing_cache_tenant_user_uniq" ON "briefing_cache" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "briefing_cache_tenant_idx" ON "briefing_cache" USING btree ("tenant_id","composed_at" DESC NULLS LAST);