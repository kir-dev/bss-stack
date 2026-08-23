import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const visibilityEnum = pgEnum('visibility', [
  'public',
  'schonherz',
  'bss',
])

export const contentStatusEnum = pgEnum('content_status', [
  'draft',
  'published',
  'archived',
  'trash',
])

export const eventStatusEnum = pgEnum('event_status', [
  'draft',
  'published',
  'archived',
])

export const membershipStatusEnum = pgEnum('membership_status', [
  'studio_member',
  'studio_candidate',
  'studio_applicant',
  'senior_active',
  'senior_archived',
  'contributor',
])

export const semesterEnum = pgEnum('semester', ['spring', 'autumn'])

export const memberSyncStatusEnum = pgEnum('member_sync_status', [
  'ok',
  'error',
])

export const memberSyncTriggerEnum = pgEnum('member_sync_trigger', [
  'startup',
  'hourly',
  'manual',
  'test',
])

export const liveStatusEnum = pgEnum('live_status', [
  'scheduled',
  'active',
  'ended',
])

export const slugEntityTypeEnum = pgEnum('slug_entity_type', ['video', 'event'])

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    memberSub: varchar('member_sub', { length: 255 }).notNull(),
    username: varchar('username', { length: 200 }).notNull(),
    groups: jsonb('groups').$type<string[]>().notNull().default([]),
    accessToken: text('access_token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('auth_sessions_expires_idx').on(table.expiresAt)],
)

export const memberCache = pgTable(
  'member_cache',
  {
    sub: varchar('sub', { length: 255 }).primaryKey(),
    username: varchar('username', { length: 200 }).notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    nickname: varchar('nickname', { length: 200 }),
    avatarUrl: varchar('avatar_url', { length: 2048 }),
    membershipStatus: membershipStatusEnum('membership_status').notNull(),
    isLeadership: boolean('is_leadership').notNull().default(false),
    joinedYear: integer('joined_year'),
    joinedSemester: semesterEnum('joined_semester'),
    joinedSemesterRaw: varchar('joined_semester_raw', { length: 100 }),
    introduction: varchar('introduction', { length: 10_000 }),
    syncStatus: memberSyncStatusEnum('sync_status').notNull().default('ok'),
    lastSyncError: text('last_sync_error'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('member_cache_username_key').on(table.username),
    index('member_cache_status_idx').on(table.membershipStatus),
  ],
)

export const memberSyncRuns = pgTable(
  'member_sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trigger: memberSyncTriggerEnum('trigger').notNull(),
    status: memberSyncStatusEnum('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    totalCount: integer('total_count').notNull().default(0),
    changedCount: integer('changed_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    message: text('message'),
  },
  (table) => [index('member_sync_runs_started_idx').on(table.startedAt)],
)

export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    description: varchar({ length: 10_000 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 2048 }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: eventStatusEnum('status').notNull().default('draft'),
    createdBy: varchar('created_by', { length: 255 }).references(
      () => memberCache.sub,
    ),
    updatedBy: varchar('updated_by', { length: 255 }).references(
      () => memberCache.sub,
    ),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('events_slug_key').on(table.slug),
    index('events_status_start_idx').on(table.status, table.startDate),
    check(
      'events_end_after_start_check',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
  ],
)

export const videos = pgTable(
  'videos',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    description: varchar({ length: 10_000 }),
    guests: varchar({ length: 5000 }),
    songs: varchar({ length: 5000 }),
    videoUrl: varchar('video_url', { length: 2048 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 2048 }),
    visibility: visibilityEnum('visibility').notNull().default('public'),
    status: contentStatusEnum('status').notNull().default('draft'),
    eventId: uuid('event_id').references(() => events.id, {
      onDelete: 'set null',
    }),
    recordedAt: date('recorded_at'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
    createdBy: varchar('created_by', { length: 255 }).references(
      () => memberCache.sub,
    ),
    updatedBy: varchar('updated_by', { length: 255 }).references(
      () => memberCache.sub,
    ),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    trashedBy: varchar('trashed_by', { length: 255 }).references(
      () => memberCache.sub,
    ),
  },
  (table) => [
    uniqueIndex('videos_slug_key').on(table.slug),
    index('videos_visibility_status_idx').on(
      table.visibility,
      table.status,
      table.publishedAt,
    ),
    index('videos_event_idx').on(table.eventId),
    index('videos_recorded_at_idx').on(table.recordedAt),
    index('videos_trash_purge_idx').on(table.status, table.trashedAt),
    check(
      'videos_published_requires_timestamp_check',
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check(
      'videos_trash_needs_timestamp_check',
      sql`${table.status} <> 'trash' or ${table.trashedAt} is not null`,
    ),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar('name', { length: 64 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('tags_normalized_name_key').on(table.normalizedName)],
)

export const videoTags = pgTable(
  'video_tags',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.videoId, table.tagId] }),
    index('video_tags_tag_idx').on(table.tagId),
  ],
)

export const staffRoles = pgTable(
  'staff_roles',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar('name', { length: 64 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 64 }).notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('staff_roles_normalized_name_key').on(table.normalizedName),
    index('staff_roles_display_order_idx').on(table.displayOrder),
  ],
)

export const videoStaff = pgTable(
  'video_staff',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => staffRoles.id, { onDelete: 'restrict' }),
    memberSub: varchar('member_sub', { length: 255 })
      .notNull()
      .references(() => memberCache.sub),
  },
  (table) => [
    primaryKey({ columns: [table.videoId, table.roleId, table.memberSub] }),
    index('video_staff_member_idx').on(table.memberSub),
    index('video_staff_role_idx').on(table.roleId),
  ],
)

export const relatedVideos = pgTable(
  'related_videos',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    relatedVideoId: uuid('related_video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.videoId, table.relatedVideoId] }),
    check(
      'related_videos_no_self_reference_check',
      sql`${table.videoId} <> ${table.relatedVideoId}`,
    ),
  ],
)

export const slugHistory = pgTable(
  'slug_history',
  {
    entityType: slugEntityTypeEnum('entity_type').notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityType, table.slug] }),
    index('slug_history_entity_idx').on(table.entityType, table.entityId),
  ],
)

export const liveStreams = pgTable(
  'live_streams',
  {
    id: uuid().primaryKey().defaultRandom(),
    youtubeVideoId: varchar('youtube_video_id', { length: 64 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: liveStatusEnum('status').notNull().default('scheduled'),
    activationError: text('activation_error'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 255 }).references(
      () => memberCache.sub,
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('live_streams_status_starts_idx').on(table.status, table.startsAt),
    check(
      'live_streams_end_after_start_check',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
)

export const siteSettings = pgTable('site_settings', {
  id: integer().primaryKey().default(0),
  highlightedVideoId: uuid('highlighted_video_id').references(() => videos.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const aboutPageVideos = pgTable(
  'about_page_videos',
  {
    position: integer('position').notNull(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.position, table.videoId] }),
    uniqueIndex('about_page_videos_video_key').on(table.videoId),
    check(
      'about_page_videos_position_range_check',
      sql`${table.position} >= 1 and ${table.position} <= 6`,
    ),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actor: varchar('actor', { length: 255 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    beforeValue: jsonb('before_value'),
    afterValue: jsonb('after_value'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_log_occurred_idx').on(table.occurredAt),
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_actor_idx').on(table.actor),
    index('audit_log_action_idx').on(table.action),
  ],
)

export const viewSessions = pgTable(
  'view_sessions',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    sessionId: varchar('session_id', { length: 128 }).notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.videoId, table.sessionId] }),
    index('view_sessions_viewed_idx').on(table.viewedAt),
  ],
)
