import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import { events, memberCache, videoStaff, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { visibleVideoCondition } from '#/server/videos/visibility.ts'

export const EVENT_PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_EVENT_PAGE_SIZE = 50

export interface PublicEventCard {
  id: string
  slug: string
  title: string
  thumbnailUrl: string | null
  /** Number of published videos visible to the viewer. */
  visibleVideoCount: number
}

export interface EventListPage {
  items: Array<PublicEventCard>
  total: number
  page: number
  perPage: number
  totalPages: number
}

export async function getEventListPage(
  executor: Executor,
  viewer: Viewer,
  params: { page?: number; perPage?: number } = {},
): Promise<EventListPage> {
  const perPageCandidate = Number(params.perPage)
  const perPage = (EVENT_PAGE_SIZES as readonly number[]).includes(
    perPageCandidate,
  )
    ? perPageCandidate
    : DEFAULT_EVENT_PAGE_SIZE
  const page =
    params.page !== undefined &&
    Number.isInteger(params.page) &&
    params.page > 0
      ? params.page
      : 1

  const rows = await executor
    .select()
    .from(events)
    .where(eq(events.status, 'published'))
    .orderBy(desc(events.startDate), desc(events.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  if (rows.length === 0) {
    return {
      items: [],
      total: await countPublishedEvents(executor),
      page,
      perPage,
      totalPages: 0,
    }
  }

  const counts = await countVisibleVideosByEvent(
    executor,
    viewer,
    rows.map((row) => row.id),
  )
  const fallbackThumbs = await latestVisibleThumbnailByEvent(
    executor,
    viewer,
    rows.map((row) => row.id),
  )

  const total = await countPublishedEvents(executor)
  return {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      thumbnailUrl: row.thumbnailUrl ?? fallbackThumbs.get(row.id) ?? null,
      visibleVideoCount: counts.get(row.id) ?? 0,
    })),
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  }
}

async function countPublishedEvents(executor: Executor): Promise<number> {
  const rows = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(eq(events.status, 'published'))
  return rows.at(0)?.count ?? 0
}

async function countVisibleVideosByEvent(
  executor: Executor,
  viewer: Viewer,
  eventIds: string[],
): Promise<Map<string, number>> {
  const rows = await executor
    .select({
      eventId: videos.eventId,
      count: sql<number>`count(*)::int`,
    })
    .from(videos)
    .where(
      and(
        eq(videos.status, 'published'),
        inArray(videos.eventId, eventIds),
        visibleVideoCondition(viewer),
      ),
    )
    .groupBy(videos.eventId)
  return new Map(
    rows
      .filter((row) => row.eventId !== null)
      .map((row) => [row.eventId as string, row.count]),
  )
}

/**
 * Cover image of the most recent visible video of the event. The public event
 * list and the homepage event strip both use it as a fallback so that the
 * same image appears in the two places.
 */
export async function latestVisibleThumbnailByEvent(
  executor: Executor,
  viewer: Viewer,
  eventIds: string[],
): Promise<Map<string, string>> {
  // DISTINCT ON: the thumbnail of the event's most recent visible video.
  const rows = await executor
    .selectDistinctOn([videos.eventId], {
      eventId: videos.eventId,
      thumbnailUrl: videos.thumbnailUrl,
    })
    .from(videos)
    .where(
      and(
        eq(videos.status, 'published'),
        inArray(videos.eventId, eventIds),
        visibleVideoCondition(viewer),
        sql`${videos.thumbnailUrl} is not null`,
      ),
    )
    .orderBy(videos.eventId, desc(videos.publishedAt), desc(videos.id))
  const map = new Map<string, string>()
  for (const row of rows) {
    if (row.eventId !== null && row.thumbnailUrl !== null) {
      map.set(row.eventId, row.thumbnailUrl)
    }
  }
  return map
}

export interface EventDetailData {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnailUrl: string | null
  startDate: string | null
  endDate: string | null
  videos: {
    items: Array<{
      id: string
      slug: string
      title: string
      thumbnailUrl: string | null
      recordedAt: string | null
    }>
    total: number
  }

  staffMembers: Array<{ username: string; fullName: string }>
}

/**
 * Public event detail: videos in descending `recordedAt` order (missing
 * values at the end), paginated by 50; the derived staff list is built only
 * from visible videos.
 */
export async function getEventDetail(
  executor: Executor,
  viewer: Viewer,
  slug: string,
  params: { page?: number } = {},
): Promise<EventDetailData | null> {
  const eventRows = await executor
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, 'published')))
    .limit(1)
  const event = eventRows.at(0)
  if (event === undefined) {
    return null
  }

  const pageSize = 50
  const page =
    params.page !== undefined &&
    Number.isInteger(params.page) &&
    params.page > 0
      ? params.page
      : 1

  const videoCondition = and(
    eq(videos.status, 'published'),
    eq(videos.eventId, event.id),
    visibleVideoCondition(viewer),
  )

  const [videoRows, countRows, staffRows] = await Promise.all([
    executor
      .select({
        id: videos.id,
        slug: videos.slug,
        title: videos.title,
        thumbnailUrl: videos.thumbnailUrl,
        recordedAt: videos.recordedAt,
      })
      .from(videos)
      .where(videoCondition)
      .orderBy(
        sql`${videos.recordedAt} desc nulls last`,
        desc(videos.publishedAt),
        desc(videos.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .where(videoCondition),
    executor
      .selectDistinct({
        sub: memberCache.sub,
        username: memberCache.username,
        fullName: memberCache.fullName,
      })
      .from(videoStaff)
      .innerJoin(memberCache, eq(memberCache.sub, videoStaff.memberSub))
      .innerJoin(videos, eq(videos.id, videoStaff.videoId))
      .where(videoCondition)
      .orderBy(asc(memberCache.fullName))
      .limit(1000),
  ])

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    thumbnailUrl:
      event.thumbnailUrl ??
      videoRows.find((video) => video.thumbnailUrl !== null)?.thumbnailUrl ??
      null,
    startDate: event.startDate,
    endDate: event.endDate,
    videos: {
      items: videoRows,
      total: countRows.at(0)?.count ?? 0,
    },
    staffMembers: staffRows.map((row) => ({
      username: row.username,
      fullName: row.fullName,
    })),
  }
}
