CREATE TABLE "auth_sessions" (
	"id" varchar(64) PRIMARY KEY,
	"member_sub" varchar(255) NOT NULL,
	"username" varchar(200) NOT NULL,
	"groups" jsonb DEFAULT '[]' NOT NULL,
	"access_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" ("expires_at");