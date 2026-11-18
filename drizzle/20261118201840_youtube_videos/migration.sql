CREATE TYPE "video_media_source" AS ENUM('server', 'youtube');--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "media_source" "video_media_source" DEFAULT 'server'::"video_media_source" NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "youtube_video_id" varchar(64);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_youtube_id_source_check" CHECK ("media_source" = 'youtube' or "youtube_video_id" is null);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_server_media_source_check" CHECK ("media_source" = 'server' or ("encoding_group" is null and "base_filename" is null and not "has_hq" and not "has_lq"));