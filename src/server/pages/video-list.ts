import { asc, eq } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import {
  events,
  staffRoles,
  tags,
  videos,
  videoStaff,
  memberCache,
} from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { searchVideosDetailed } from '#/server/search/service.ts'
import type { VideoSort } from '#/server/search/service.ts'

export const VIDEO_SORTS = ['published', 'chronological', 'mostviewed'] as const
export const VIDEO_PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_VIDEO_PAGE_SIZE = 50

const SORT_LABELS: Record<VideoSort, string> = {
  published: 'Legutóbb feltöltött',
  chronological: 'Időrendi',
  mostviewed: 'Legnézettebb',
}

export function videoSortLabel(sort: VideoSort): string {
  return SORT_LABELS[sort]
}

/** A `/videos` URL-állapotának nyers (string) formája. */
export interface VideoListRawSearch {
  q?: string
  sort?: string
  page?: string | number
  perPage?: string | number
  tags?: string | string[]
  event?: string
  from?: string
  to?: string
  staffMember?: string
  staffRole?: string
}

export interface ParsedVideoListQuery {
  q: string
  sort: VideoSort
  page: number
  perPage: number
  tagNames: string[]
  eventSlug: string
  recordedFrom: string
  recordedTo: string
  staffMemberSub: string
  staffRoleId: string
}

/**
 * URL-állapot értelmezése (spec 5.8): ismeretlen rendezés és oldalméret az
 * alapértelmezésre esik vissza; lapozás mindig pozitív egész.
 */
export function parseVideoListSearch(
  raw: VideoListRawSearch,
): ParsedVideoListQuery {
  const sort = (VIDEO_SORTS as readonly string[]).includes(raw.sort ?? '')
    ? (raw.sort as VideoSort)
    : 'published'

  const perPageCandidate = Number(raw.perPage)
  const perPage = (VIDEO_PAGE_SIZES as readonly number[]).includes(
    perPageCandidate,
  )
    ? perPageCandidate
    : DEFAULT_VIDEO_PAGE_SIZE

  const pageCandidate = Number(raw.page)
  const page =
    Number.isInteger(pageCandidate) && pageCandidate > 0 ? pageCandidate : 1

  const rawTags = raw.tags === undefined ? [] : [raw.tags].flat()
  const tagNames = rawTags.map((tag) => tag.trim()).filter((tag) => tag !== '')

  return {
    q: typeof raw.q === 'string' ? raw.q.trim() : '',
    sort,
    page,
    perPage,
    tagNames,
    eventSlug: typeof raw.event === 'string' ? raw.event : '',
    recordedFrom: isIsoDate(raw.from) ? raw.from : '',
    recordedTo: isIsoDate(raw.to) ? raw.to : '',
    staffMemberSub:
      typeof raw.staffMember === 'string' && raw.staffMember !== ''
        ? raw.staffMember
        : '',
    staffRoleId:
      typeof raw.staffRole === 'string' && raw.staffRole !== ''
        ? raw.staffRole
        : '',
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export interface VideoListItem {
  id: string
  slug: string
  title: string
  thumbnailUrl: string | null
}

export interface VideoListPage {
  items: Array<VideoListItem>
  total: number
  page: number
  perPage: number
  totalPages: number
}

/**
 * Videólista lekérdezése a néző jogosultsága szerint. Az eseményszűrő slugon
 * érkezik (megosztható URL), a szolgáltatás eseményazonosítót vár.
 */
export async function getVideoListPage(
  executor: Executor,
  viewer: Viewer,
  query: ParsedVideoListQuery,
): Promise<VideoListPage> {
  let eventId: string | undefined
  if (query.eventSlug !== '') {
    const rows = await executor
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, query.eventSlug))
      .limit(1)
    eventId = rows.at(0)?.id
    // Ismeretlen esemény slugra nincs találat, nem hibázunk.
    if (eventId === undefined) {
      return {
        items: [],
        total: 0,
        page: query.page,
        perPage: query.perPage,
        totalPages: 0,
      }
    }
  }

  const result = await searchVideosDetailed(executor, {
    viewer,
    query: query.q === '' ? undefined : query.q,
    tagNames: query.tagNames.length > 0 ? query.tagNames : undefined,
    eventId,
    recordedFrom: query.recordedFrom === '' ? undefined : query.recordedFrom,
    recordedTo: query.recordedTo === '' ? undefined : query.recordedTo,
    staffMemberSub:
      query.staffMemberSub === '' ? undefined : query.staffMemberSub,
    staffRoleId: query.staffRoleId === '' ? undefined : query.staffRoleId,
    sort: query.sort,
    limit: query.perPage,
    offset: (query.page - 1) * query.perPage,
  })

  const totalPages =
    query.perPage > 0 ? Math.ceil(result.total / query.perPage) : 0

  return {
    items: result.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
    })),
    total: result.total,
    page: query.page,
    perPage: query.perPage,
    totalPages,
  }
}

export interface VideoFilterOptions {
  tags: Array<{ name: string }>
  events: Array<{ slug: string; title: string }>
  staffRoles: Array<{ id: string; name: string }>
  /** Csak olyan tagok, akik legalább egy publikált videó stáblistáján szerepelnek. */
  staffMembers: Array<{ sub: string; fullName: string }>
}

/** Szűrőlisták a videóoldalhoz (publikus adatok). */
export async function getVideoFilterOptions(
  executor: Executor,
): Promise<VideoFilterOptions> {
  const [tagRows, eventRows, roleRows, memberRows] = await Promise.all([
    executor.select({ name: tags.name }).from(tags).orderBy(asc(tags.name)),
    executor
      .select({ slug: events.slug, title: events.title })
      .from(events)
      .where(eq(events.status, 'published'))
      .orderBy(asc(events.title)),
    executor
      .select({ id: staffRoles.id, name: staffRoles.name })
      .from(staffRoles)
      .orderBy(asc(staffRoles.displayOrder), asc(staffRoles.name)),
    executor
      .selectDistinct({
        sub: memberCache.sub,
        fullName: memberCache.fullName,
      })
      .from(videoStaff)
      .innerJoin(videos, eq(videos.id, videoStaff.videoId))
      .innerJoin(memberCache, eq(memberCache.sub, videoStaff.memberSub))
      .where(eq(videos.status, 'published'))
      .orderBy(asc(memberCache.fullName))
      .limit(1000),
  ])
  return {
    tags: tagRows,
    events: eventRows,
    staffRoles: roleRows,
    staffMembers: memberRows,
  }
}
