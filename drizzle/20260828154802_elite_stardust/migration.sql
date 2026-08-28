ALTER TABLE "videos" ADD COLUMN "has_hq" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "has_lq" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "videos"
SET
	"has_hq" = "quality" = 'hq',
	"has_lq" = "quality" IN ('lq', 'hq');--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "quality";--> statement-breakpoint
DROP TYPE "video_quality";
