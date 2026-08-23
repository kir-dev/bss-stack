-- Tiszta migrációs alap: a specifikáció szerint a prototípus sémája eldobható.
-- Ez a migráció a régi lokális prototípus-objektumokat eldobja.
-- Csak fejlesztői környezetben fusson!
DROP TABLE IF EXISTS "users_roles" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "videos_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "events_roles_users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "videos_roles_users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "roles" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "video_tags" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "related_videos" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "videos" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tags" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "current_homepage_status" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "homepage_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "homepage_status";--> statement-breakpoint
DROP TYPE IF EXISTS "visibility";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
CREATE TYPE "content_status" AS ENUM('draft', 'published', 'archived', 'trash');--> statement-breakpoint
CREATE TYPE "event_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "live_status" AS ENUM('scheduled', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "member_sync_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('studio_member', 'studio_candidate', 'studio_applicant', 'senior_active', 'senior_archived', 'contributor');--> statement-breakpoint
CREATE TYPE "semester" AS ENUM('spring', 'autumn');--> statement-breakpoint
CREATE TYPE "slug_entity_type" AS ENUM('video', 'event');--> statement-breakpoint
CREATE TYPE "visibility" AS ENUM('public', 'schonherz', 'bss');--> statement-breakpoint
CREATE TABLE "about_page_videos" (
	"position" integer,
	"video_id" uuid,
	CONSTRAINT "about_page_videos_pkey" PRIMARY KEY("position","video_id"),
	CONSTRAINT "about_page_videos_position_range_check" CHECK ("position" >= 1 and "position" <= 6)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY,
	"actor" varchar(255) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(200) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(10000),
	"thumbnail_url" varchar(2048),
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "event_status" DEFAULT 'draft'::"event_status" NOT NULL,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_end_after_start_check" CHECK ("end_date" is null or "end_date" >= "start_date")
);
--> statement-breakpoint
CREATE TABLE "live_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"youtube_video_id" varchar(64) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "live_status" DEFAULT 'scheduled'::"live_status" NOT NULL,
	"activation_error" text,
	"activated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_streams_end_after_start_check" CHECK ("ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE TABLE "member_cache" (
	"sub" varchar(255) PRIMARY KEY,
	"username" varchar(200) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"nickname" varchar(200),
	"avatar_url" varchar(2048),
	"membership_status" "membership_status" NOT NULL,
	"is_leadership" boolean DEFAULT false NOT NULL,
	"joined_year" integer,
	"joined_semester" "semester",
	"joined_semester_raw" varchar(100),
	"introduction" varchar(10000),
	"sync_status" "member_sync_status" DEFAULT 'ok'::"member_sync_status" NOT NULL,
	"last_sync_error" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "related_videos" (
	"video_id" uuid,
	"related_video_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "related_videos_pkey" PRIMARY KEY("video_id","related_video_id"),
	CONSTRAINT "related_videos_no_self_reference_check" CHECK ("video_id" <> "related_video_id")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 0,
	"highlighted_video_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_history" (
	"entity_type" "slug_entity_type",
	"slug" varchar(200),
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slug_history_pkey" PRIMARY KEY("entity_type","slug")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(64) NOT NULL,
	"normalized_name" varchar(64) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(64) NOT NULL,
	"normalized_name" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_staff" (
	"video_id" uuid,
	"role_id" uuid,
	"member_sub" varchar(255),
	CONSTRAINT "video_staff_pkey" PRIMARY KEY("video_id","role_id","member_sub")
);
--> statement-breakpoint
CREATE TABLE "video_tags" (
	"video_id" uuid,
	"tag_id" uuid,
	CONSTRAINT "video_tags_pkey" PRIMARY KEY("video_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(200) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(10000),
	"guests" varchar(5000),
	"songs" varchar(5000),
	"video_url" varchar(2048),
	"thumbnail_url" varchar(2048),
	"visibility" "visibility" DEFAULT 'public'::"visibility" NOT NULL,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"event_id" uuid,
	"recorded_at" date,
	"published_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trashed_at" timestamp with time zone,
	"trashed_by" varchar(255),
	CONSTRAINT "videos_published_requires_timestamp_check" CHECK ("status" <> 'published' or "published_at" is not null),
	CONSTRAINT "videos_trash_needs_timestamp_check" CHECK ("status" <> 'trash' or "trashed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "view_sessions" (
	"video_id" uuid,
	"session_id" varchar(128),
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "view_sessions_pkey" PRIMARY KEY("video_id","session_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "about_page_videos_video_key" ON "about_page_videos" ("video_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "audit_log" ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" ("actor");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" ("slug");--> statement-breakpoint
CREATE INDEX "events_status_start_idx" ON "events" ("status","start_date");--> statement-breakpoint
CREATE INDEX "live_streams_status_starts_idx" ON "live_streams" ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_cache_username_key" ON "member_cache" ("username");--> statement-breakpoint
CREATE INDEX "member_cache_status_idx" ON "member_cache" ("membership_status");--> statement-breakpoint
CREATE INDEX "slug_history_entity_idx" ON "slug_history" ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_roles_normalized_name_key" ON "staff_roles" ("normalized_name");--> statement-breakpoint
CREATE INDEX "staff_roles_display_order_idx" ON "staff_roles" ("display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_normalized_name_key" ON "tags" ("normalized_name");--> statement-breakpoint
CREATE INDEX "video_staff_member_idx" ON "video_staff" ("member_sub");--> statement-breakpoint
CREATE INDEX "video_staff_role_idx" ON "video_staff" ("role_id");--> statement-breakpoint
CREATE INDEX "video_tags_tag_idx" ON "video_tags" ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_slug_key" ON "videos" ("slug");--> statement-breakpoint
CREATE INDEX "videos_visibility_status_idx" ON "videos" ("visibility","status","published_at");--> statement-breakpoint
CREATE INDEX "videos_event_idx" ON "videos" ("event_id");--> statement-breakpoint
CREATE INDEX "videos_recorded_at_idx" ON "videos" ("recorded_at");--> statement-breakpoint
CREATE INDEX "videos_trash_purge_idx" ON "videos" ("status","trashed_at");--> statement-breakpoint
CREATE INDEX "view_sessions_viewed_idx" ON "view_sessions" ("viewed_at");--> statement-breakpoint
ALTER TABLE "about_page_videos" ADD CONSTRAINT "about_page_videos_video_id_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_member_cache_sub_fkey" FOREIGN KEY ("created_by") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_member_cache_sub_fkey" FOREIGN KEY ("updated_by") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_created_by_member_cache_sub_fkey" FOREIGN KEY ("created_by") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "related_videos" ADD CONSTRAINT "related_videos_video_id_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "related_videos" ADD CONSTRAINT "related_videos_related_video_id_videos_id_fkey" FOREIGN KEY ("related_video_id") REFERENCES "videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_highlighted_video_id_videos_id_fkey" FOREIGN KEY ("highlighted_video_id") REFERENCES "videos"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "video_staff" ADD CONSTRAINT "video_staff_video_id_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "video_staff" ADD CONSTRAINT "video_staff_role_id_staff_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "staff_roles"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "video_staff" ADD CONSTRAINT "video_staff_member_sub_member_cache_sub_fkey" FOREIGN KEY ("member_sub") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_video_id_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_created_by_member_cache_sub_fkey" FOREIGN KEY ("created_by") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_updated_by_member_cache_sub_fkey" FOREIGN KEY ("updated_by") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_trashed_by_member_cache_sub_fkey" FOREIGN KEY ("trashed_by") REFERENCES "member_cache"("sub");--> statement-breakpoint
ALTER TABLE "view_sessions" ADD CONSTRAINT "view_sessions_video_id_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Live időablakok nem fedhetik egymást (specifikáció 9.3).
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_no_overlap_excl" EXCLUDE USING gist (tstzrange("starts_at", "ends_at") WITH &&);
