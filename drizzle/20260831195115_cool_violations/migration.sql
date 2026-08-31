ALTER TABLE "member_cache" ALTER COLUMN "membership_status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "member_cache"
SET "membership_status" = CASE "membership_status"
  WHEN 'studio_applicant' THEN 'MEMBER_CANDIDATE_CANDIDATE'
  WHEN 'studio_candidate' THEN 'MEMBER_CANDIDATE'
  WHEN 'studio_member' THEN 'MEMBER'
  WHEN 'senior_active' THEN 'ACTIVE_ALUMNI'
  WHEN 'senior_archived' THEN 'ALUMNI'
  WHEN 'contributor' THEN 'ALUMNI'
  ELSE "membership_status"
END;--> statement-breakpoint
DROP TYPE "membership_status";--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('MEMBER_CANDIDATE_CANDIDATE', 'MEMBER_CANDIDATE', 'MEMBER', 'ACTIVE_ALUMNI', 'ALUMNI');--> statement-breakpoint
ALTER TABLE "member_cache" ALTER COLUMN "membership_status" SET DATA TYPE "membership_status" USING "membership_status"::"membership_status";
