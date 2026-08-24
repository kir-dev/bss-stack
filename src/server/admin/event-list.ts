import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { events, memberCache, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

const EVENT_STATUSES = ['draft', 'published', 'archived'] as const

export interface AdminEventListFilters {
  q?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

export function parseAdminEventFilters(raw: {
  q?: unknown
  status?: unknown
  from?: unknown
  to?: unknown
}): AdminEventListFilters {
  const filters: AdminEventListFilters = {}
  if (typeof raw.q === 'string' && raw.q.trim() !== '') {
    filters.q = raw.q.trim()
  }
  if (
    typeof raw.status === 'string' &&
    (EVENT_STATUSES as readonly string[]).includes(raw.status)
  ) {
    filters.status = raw.status
  }
  if (typeof raw.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.from)) {
    filters.dateFrom = raw.from
  }
  if (typeof raw.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.to)) {
    filters.dateTo = raw.to
  }
  return filters
}

export interface AdminEventListItem {
  id: string
  slug: string
  title: string
  startDate: string | null
  endDate: string | null
  status: string
  videoCount: number
  updatedByName: string | null
  updatedAt: Date
  version: number
}

/**
 * Event admin list (spec 12.3): title, date range, status,
 * video count (all statuses), last modifier and timestamp.
 */
export async function getAdminEventList(
  executor: Executor,
  query: { page: number; perPage: number; filters?: AdminEventListFilters },
): Promise<{
  items: AdminEventListItem[]
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
      ilike(events.title, pattern),
      ilike(events.slug, pattern),
    )
    if (condition !== undefined) {
      conditions.push(condition)
    }
  }
  if (filters.status !== undefined) {
    conditions.push(eq(events.status, filters.status as never))
  }
  if (filters.dateFrom !== undefined) {
    conditions.push(gte(events.startDate, filters.dateFrom))
  }
  if (filters.dateTo !== undefined) {
    conditions.push(lte(events.startDate, filters.dateTo))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const videoCountSub = sql<number>`(select count(*)::int from ${videos} where ${videos.eventId} = ${events.id})`

  const items = await executor
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      status: events.status,
      videoCount: videoCountSub,
      updatedByName: memberCache.fullName,
      updatedAt: events.updatedAt,
      version: events.version,
    })
    .from(events)
    .leftJoin(memberCache, eq(memberCache.sub, events.updatedBy))
    .where(where)
    .orderBy(desc(events.startDate), desc(events.id))
    .limit(query.perPage)
    .offset((query.page - 1) * query.perPage)

  const countRows = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(where)
  const total = countRows.at(0)?.count ?? 0

  return {
    items: items.map((item) => ({
      ...item,
      videoCount: Number(item.videoCount),
    })),
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: query.perPage > 0 ? Math.ceil(total / query.perPage) : 0,
  }
}

export interface AdminEventDetail {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnailUrl: string | null
  startDate: string | null
  endDate: string | null
  status: string
  version: number
  updatedAt: Date
  updatedByName: string | null
  /** For the hard-delete preview: how many videos will be detached. */
  attachedVideoIds: string[]
}

export async function getAdminEventDetail(
  executor: Executor,
  eventId: string,
): Promise<AdminEventDetail | null> {
  const rows = await executor
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      description: events.description,
      thumbnailUrl: events.thumbnailUrl,
      startDate: events.startDate,
      endDate: events.endDate,
      status: events.status,
      version: events.version,
      updatedAt: events.updatedAt,
      updatedByName: memberCache.fullName,
    })
    .from(events)
    .leftJoin(memberCache, eq(memberCache.sub, events.updatedBy))
    .where(eq(events.id, eventId))
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    return null
  }
  const attached = await executor
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.eventId, eventId))
  return { ...row, attachedVideoIds: attached.map((item) => item.id) }
}
