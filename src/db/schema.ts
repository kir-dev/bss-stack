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

export const videoEncodingGroupEnum = pgEnum('video_encoding_group', [
  '4a3_SD',
  '16a9_SD',
  '16a9_HD',
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
  'MEMBER_CANDIDATE_CANDIDATE',
  'MEMBER_CANDIDATE',
  'MEMBER',
  'ACTIVE_ALUMNI',
  'ALUMNI',
])

export const semesterEnum = pgEnum('semester', ['spring', 'autumn'])

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'ok',
  'rejected',
  'duplicate',
])

export const webhookDeliveryModeEnum = pgEnum('webhook_delivery_mode', [
  'operations',
  'replace',
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
    introduction: varchar('introduction', { length: 10_000 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft delete: retired members keep their staff credits but leave every listing. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('member_cache_username_key').on(table.username),
    index('member_cache_status_idx').on(table.membershipStatus),
    index('member_cache_deleted_idx').on(table.deletedAt),
  ],
)

/**
 * Webhook clients that may push member data. The secret is stored only as a
 * scrypt hash; the plaintext is shown once, at creation/rotation time.
 */
export const webhookClients = pgTable(
  'webhook_clients',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    secretHash: text('secret_hash').notNull(),
    /**
     * Authentik sub of the leadership member who created it. Deliberately not
     * a foreign key: leadership comes from the OIDC groups, so an admin may
     * legitimately have no member_cache row yet (e.g. before the first push).
     */
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('webhook_clients_name_key').on(table.name)],
)

/** Receipt log of member pushes; also the idempotency store for delivery ids. */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => webhookClients.id, { onDelete: 'cascade' }),
    deliveryId: varchar('delivery_id', { length: 200 }),
    mode: webhookDeliveryModeEnum('mode').notNull().default('operations'),
    status: webhookDeliveryStatusEnum('status').notNull(),
    operationCount: integer('operation_count').notNull().default(0),
    createdCount: integer('created_count').notNull().default(0),
    updatedCount: integer('updated_count').notNull().default(0),
    deletedCount: integer('deleted_count').notNull().default(0),
    restoredCount: integer('restored_count').notNull().default(0),
    message: text('message'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_received_idx').on(table.receivedAt),
    uniqueIndex('webhook_deliveries_delivery_key').on(
      table.clientId,
      table.deliveryId,
    ),
  ],
)

export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    description: varchar({ length: 10_000 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 2048 }),

    // a publication requirement (validated on the application side).
    startDate: date('start_date'),
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
    encodingGroup: videoEncodingGroupEnum('encoding_group'),
    hasHq: boolean('has_hq').notNull().default(false),
    hasLq: boolean('has_lq').notNull().default(false),
    baseFilename: varchar('base_filename', { length: 255 }),
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
