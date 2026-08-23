CREATE TYPE "member_sync_trigger" AS ENUM('startup', 'hourly', 'manual', 'test');--> statement-breakpoint
CREATE TABLE "member_sync_runs" (
	"id" bigserial PRIMARY KEY,
	"trigger" "member_sync_trigger" NOT NULL,
	"status" "member_sync_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"total_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE INDEX "member_sync_runs_started_idx" ON "member_sync_runs" ("started_at");