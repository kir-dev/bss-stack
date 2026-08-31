ALTER TABLE "member_cache" RENAME COLUMN "deleted_at" TO "archived_at";--> statement-breakpoint
ALTER TABLE "webhook_deliveries" RENAME COLUMN "deleted_count" TO "archived_count";--> statement-breakpoint
ALTER INDEX "member_cache_deleted_idx" RENAME TO "member_cache_archived_idx";