CREATE TYPE "webhook_delivery_mode" AS ENUM('operations', 'replace');--> statement-breakpoint
CREATE TYPE "webhook_delivery_status" AS ENUM('ok', 'rejected', 'duplicate');--> statement-breakpoint
CREATE TABLE "webhook_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(200) NOT NULL,
	"secret_hash" text NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" bigserial PRIMARY KEY,
	"client_id" uuid NOT NULL,
	"delivery_id" varchar(200),
	"mode" "webhook_delivery_mode" DEFAULT 'operations'::"webhook_delivery_mode" NOT NULL,
	"status" "webhook_delivery_status" NOT NULL,
	"operation_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"deleted_count" integer DEFAULT 0 NOT NULL,
	"restored_count" integer DEFAULT 0 NOT NULL,
	"message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "member_sync_runs";--> statement-breakpoint
ALTER TABLE "member_cache" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "member_cache" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_cache" DROP COLUMN "sync_status";--> statement-breakpoint
ALTER TABLE "member_cache" DROP COLUMN "last_sync_error";--> statement-breakpoint
ALTER TABLE "member_cache" DROP COLUMN "last_seen_at";--> statement-breakpoint
CREATE INDEX "member_cache_deleted_idx" ON "member_cache" ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_clients_name_key" ON "webhook_clients" ("name");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_received_idx" ON "webhook_deliveries" ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_delivery_key" ON "webhook_deliveries" ("client_id","delivery_id");--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_client_id_webhook_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "webhook_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
DROP TYPE "member_sync_status";--> statement-breakpoint
DROP TYPE "member_sync_trigger";