ALTER TABLE "member_cache" ADD COLUMN "leadership_role" varchar(200);--> statement-breakpoint
ALTER TABLE "member_cache" ALTER COLUMN "membership_status" SET DATA TYPE text;--> statement-breakpoint
-- ALUMNI used to mean "no longer active"; from now on an unarchived ALUMNI is an
-- active alumnus, so the former plain alumni move to the archive first.
UPDATE "member_cache" SET "archived_at" = now(), "updated_at" = now()
WHERE "membership_status" = 'ALUMNI' AND "archived_at" IS NULL;--> statement-breakpoint
UPDATE "member_cache" SET "membership_status" = 'ALUMNI'
WHERE "membership_status" = 'ACTIVE_ALUMNI';--> statement-breakpoint
DROP TYPE "membership_status";--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('MEMBER_CANDIDATE_CANDIDATE', 'MEMBER_CANDIDATE', 'MEMBER', 'ALUMNI');--> statement-breakpoint
ALTER TABLE "member_cache" ALTER COLUMN "membership_status" SET DATA TYPE "membership_status" USING "membership_status"::"membership_status";--> statement-breakpoint
ALTER TABLE "member_cache" DROP COLUMN "is_leadership";--> statement-breakpoint
ALTER TABLE "member_cache" ALTER COLUMN "username" DROP NOT NULL;