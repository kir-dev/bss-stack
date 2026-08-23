ALTER TABLE "live_streams" DROP CONSTRAINT IF EXISTS "live_streams_no_overlap_excl";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_no_overlap_excl" EXCLUDE USING gist (tstzrange("starts_at", "ends_at") WITH &&) WHERE ("status" <> 'ended');
