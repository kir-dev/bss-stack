CREATE TYPE "video_encoding_group" AS ENUM('4a3_SD', '16a9_SD', '16a9_HD');--> statement-breakpoint
CREATE TYPE "video_quality" AS ENUM('lq', 'hq');--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "encoding_group" "video_encoding_group";--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "quality" "video_quality";--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "base_filename" varchar(255);--> statement-breakpoint
UPDATE "videos"
SET
	"encoding_group" = CASE
		WHEN concat("video_url", "thumbnail_url") LIKE '%/bss_vagott_web_4a3_SD/%' THEN '4a3_SD'::"video_encoding_group"
		WHEN concat("video_url", "thumbnail_url") LIKE '%/bss_vagott_web_16a9_SD/%' THEN '16a9_SD'::"video_encoding_group"
		WHEN concat("video_url", "thumbnail_url") LIKE '%/bss_vagott_web_16a9_HD/%' THEN '16a9_HD'::"video_encoding_group"
		ELSE NULL
	END,
	"quality" = CASE
		WHEN "video_url" LIKE '%/low_quality/%_lq.mp4%' THEN 'lq'::"video_quality"
		WHEN "video_url" LIKE '%/high_quality/%_hq_SD.mp4%'
			OR "video_url" LIKE '%/high_quality/%_hq_HD.mp4%' THEN 'hq'::"video_quality"
		ELSE NULL
	END,
	"base_filename" = coalesce(
		substring("thumbnail_url" from '.*/thumbnail/([^/]+)_tn\.png(?:\?.*)?$'),
		substring("video_url" from '.*/(?:low_quality|high_quality)/([^/]+)_(?:lq|hq_SD|hq_HD)\.mp4(?:\?.*)?$')
	);--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "videos"
		WHERE "status" = 'published'
			AND ("encoding_group" IS NULL OR "quality" IS NULL OR "base_filename" IS NULL)
	) THEN
		RAISE EXCEPTION 'Published video URLs do not match the supported BSS media profile layout';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "video_url";--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "thumbnail_url";
