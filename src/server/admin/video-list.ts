import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { events, memberCache, tags, videoTags, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

export const ADMIN_PAGE_SIZES = [10, 25, 50, 100] as const
export const ADMIN_DEFAULT_PAGE_SIZE = 25

const CONTENT_STATUSES = ['draft', 'published', 'archived', 'trash'] as const
const VISIBILITIES = ['public', 'schonherz', 'bss'] as const

export interface AdminVideoListFilters {
  q?: string
  status?: string
  visibility?: string
  eventId?: string
  tagId?: string
}

export interface AdminVideoListItem {
  id: string
  slug: string
  title: string
  thumbnailUrl: string | null
  status: string
  visibility: string
  eventId: string | null
  eventTitle: string | null
  recordedAt: string | null
  publishedAt: Date | null
  viewCount: number
  updatedByName: string | null
  updatedAt: Date
  version: number
}

export interface AdminVideoListQuery {
  page: number
  perPage: number
  filters?: AdminVideoListFilters
}

/** URL-értékek értelmezése; ismeretlen szűrőérték alapállapotra esik vissza. */
export function parseAdminVideoFilters(raw: {
  q?: unknown
  status?: unknown
  visibility?: unknown
  event?: unknown
  tag?: unknown
}): AdminVideoListFilters {
  const filters: AdminVideoListFilters = {}
  if (typeof raw.q === 'string' && raw.q.trim() !== '') {
    filters.q = raw.q.trim()
  }
  if (
    typeof raw.status === 'string' &&
    (CONTENT_STATUSES as readonly string[]).includes(raw.status)
  ) {
    filters.status = raw.status
  }
  if (
    typeof raw.visibility === 'string' &&
    (VISIBILITIES as readonly string[]).includes(raw.visibility)
  ) {
    filters.visibility = raw.visibility
  }
  if (typeof raw.event === 'string' && /^[0-9a-f-]{36}$/i.test(raw.event)) {
    filters.eventId = raw.event
  }
  if (typeof raw.tag === 'string' && /^[0-9a-f-]{36}$/i.test(raw.tag)) {
    filters.tagId = raw.tag
  }
  return filters
}

/**
 * Admin videólista (spec 12.2): minden állapot látszik, lapozva,
 * kereséssel és állapot-, láthatóság-, esemény- és címkeszűrővel.
 * Tömeges művelet nincs (spec 19).
 */
export async function getAdminVideoList(
  executor: Executor,
  query: AdminVideoListQuery,
): Promise<{
  items: AdminVideoListItem[]
  total: number
  page: number
  perPage: number
  totalPages: number
}> {
  const conditions: SQL[] = []
  const filters = query.filters ?? {}
  if (filters.q !== undefined) {
    const pattern = `%${filters.q}%`
    const condition = or(
      ilike(videos.title, pattern),
      ilike(videos.slug, pattern),
      ilike(videos.description, pattern),
    )
    if (condition !== undefined) {
      conditions.push(condition)
    }
  }
  if (filters.status !== undefined) {
    conditions.push(eq(videos.status, filters.status as never))
  }
  if (filters.visibility !== undefined) {
    conditions.push(eq(videos.visibility, filters.visibility as never))
  }
  if (filters.eventId !== undefined) {
    conditions.push(eq(videos.eventId, filters.eventId))
  }
  if (filters.tagId !== undefined) {
    conditions.push(
      sql`exists (select 1 from ${videoTags} where ${videoTags.videoId} = ${videos.id} and ${videoTags.tagId} = ${filters.tagId})`,
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const offset = (query.page - 1) * query.perPage

  const items = await executor
    .select({
      id: videos.id,
      slug: videos.slug,
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      status: videos.status,
      visibility: videos.visibility,
      eventId: videos.eventId,
      eventTitle: events.title,
      recordedAt: videos.recordedAt,
      publishedAt: videos.publishedAt,
      viewCount: videos.viewCount,
      updatedByName: memberCache.fullName,
      updatedAt: videos.updatedAt,
      version: videos.version,
    })
    .from(videos)
    .leftJoin(events, eq(events.id, videos.eventId))
    .leftJoin(memberCache, eq(memberCache.sub, videos.updatedBy))
    .where(where)
    .orderBy(desc(videos.updatedAt), desc(videos.id))
    .limit(query.perPage)
    .offset(offset)

  const countRows = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(videos)
    .where(where)
  const total = countRows.at(0)?.count ?? 0

  return {
    items,
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: query.perPage > 0 ? Math.ceil(total / query.perPage) : 0,
  }
}

export interface AdminVideoFilterOptions {
  events: Array<{ id: string; title: string }>
  tags: Array<{ id: string; name: string }>
}

/** Szűrőlegörtek az admin videólistához. */
export async function getAdminVideoFilterOptions(
  executor: Executor,
): Promise<AdminVideoFilterOptions> {
  const [eventRows, tagRows] = await Promise.all([
    executor
      .select({ id: events.id, title: events.title })
      .from(events)
      .orderBy(events.title),
    executor
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .orderBy(tags.name),
  ])
  return { events: eventRows, tags: tagRows }
}
