import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { videoThumbnailUrl } from '#/lib/video-media.ts'
import type { VideoEncodingGroup } from '#/lib/video-media.ts'

export const MIN_QUERY_LENGTH = 2
const TRIGRAM_THRESHOLD = 0.3

export interface SearchScoredRow<T> {
  item: T
  score: number
}

export interface SearchResults {
  videos: Array<SearchScoredRow<VideoHit>>
  events: Array<SearchScoredRow<EventHit>>
  members: Array<SearchScoredRow<MemberHit>>
  tags: Array<SearchScoredRow<TagHit>>
}

export interface VideoHit {
  id: string
  slug: string
  title: string
  publishedAt: Date | null
  thumbnailUrl: string | null
}

export interface EventHit {
  id: string
  slug: string
  title: string
  startDate: string | null
}

export interface MemberHit {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
}

export interface TagHit {
  id: string
  name: string
}

/** Video visibility condition as raw SQL (same rule as visibility.ts). */
function visibilitySql(viewer: Viewer): string {
  if (viewer.level === 'member' || viewer.level === 'leadership') {
    return 'true'
  }
  if (viewer.level === 'schonherz') {
    return "(v.visibility in ('public', 'schonherz'))"
  }
  return "(v.visibility = 'public')"
}

export interface SearchOptions {
  /** Hit limit per type; the popover uses five, the All tab ten. */
  limitPerType?: number
}

export async function search(
  executor: Executor,
  viewer: Viewer,
  rawQuery: string,
  options: SearchOptions = {},
): Promise<SearchResults> {
  const query = rawQuery.trim()
  if (query.length < MIN_QUERY_LENGTH) {
    return { videos: [], events: [], members: [], tags: [] }
  }
  const limit = options.limitPerType ?? 5

  const [videos, events, members, tags] = await Promise.all([
    searchVideosRaw(executor, viewer, query, limit),
    searchEventsRaw(executor, query, limit),
    searchMembersRaw(executor, query, limit),
    searchTagsRaw(executor, query, limit),
  ])

  return { videos, events, members, tags }
}

// ---------------------------------------------------------------------------

// 100-point exact match > 80 prefix > 70/55 tags > 50 trigram >
// 40 event title > 30 guests/staff > 20 description/introduction
// ---------------------------------------------------------------------------

async function searchVideosRaw(
  executor: Executor,
  viewer: Viewer,
  query: string,
  limit: number,
): Promise<Array<SearchScoredRow<VideoHit>>> {
  const rows = await executor.execute(sql`
    with q as (select ${query} as text)
    select v.id, v.slug, v.title, v.published_at as "publishedAt",
      v.encoding_group as "encodingGroup", v.base_filename as "baseFilename",
      greatest(
        case when bss_norm(v.title) = bss_norm(q.text) then 100 else 0 end,
        case when bss_norm(v.title) like bss_norm(q.text) || '%' then 80 else 0 end,
        case when exists (
          select 1 from video_tags vt join tags t on t.id = vt.tag_id
          where vt.video_id = v.id and bss_norm(t.name) like '%' || bss_norm(q.text) || '%'
        ) then 70 else 0 end,
        case when similarity(bss_norm(v.title), bss_norm(q.text)) > ${TRIGRAM_THRESHOLD}
          then round(50 * similarity(bss_norm(v.title), bss_norm(q.text))) else 0 end,
        case when e.id is not null and bss_norm(e.title) like '%' || bss_norm(q.text) || '%' then 40 else 0 end,
        case when coalesce(bss_norm(v.guests), '') like '%' || bss_norm(q.text) || '%' then 30 else 0 end,
        case when exists (
          select 1 from video_staff vs join member_cache mc on mc.sub = vs.member_sub
          where vs.video_id = v.id and bss_norm(mc.full_name) like '%' || bss_norm(q.text) || '%'
        ) then 25 else 0 end,
        case when coalesce(bss_norm(v.description), '') like '%' || bss_norm(q.text) || '%' then 20 else 0 end
      ) as score
    from videos v
    left join events e on e.id = v.event_id
    cross join q
    where v.status = 'published'
      and ${sql.raw(visibilitySql(viewer))}
      and (
        greatest(
          case when bss_norm(v.title) like '%' || bss_norm(q.text) || '%' then 1 else 0 end,
          case when similarity(bss_norm(v.title), bss_norm(q.text)) > ${TRIGRAM_THRESHOLD} then 1 else 0 end,
          case when exists (
            select 1 from video_tags vt join tags t on t.id = vt.tag_id
            where vt.video_id = v.id and bss_norm(t.name) like '%' || bss_norm(q.text) || '%'
          ) then 1 else 0 end,
          case when e.id is not null and bss_norm(e.title) like '%' || bss_norm(q.text) || '%' then 1 else 0 end,
          case when coalesce(bss_norm(v.guests), '') like '%' || bss_norm(q.text) || '%' then 1 else 0 end,
          case when exists (
            select 1 from video_staff vs join member_cache mc on mc.sub = vs.member_sub
            where vs.video_id = v.id and bss_norm(mc.full_name) like '%' || bss_norm(q.text) || '%'
          ) then 1 else 0 end,
          case when coalesce(bss_norm(v.description), '') like '%' || bss_norm(q.text) || '%' then 1 else 0 end
        ) > 0
      )
    order by score desc, v.published_at desc nulls last, v.id
    limit ${limit}
  `)
  return (
    rows.rows as unknown as Array<
      Omit<VideoHit, 'thumbnailUrl'> & VideoMediaRow & { score: number }
    >
  ).map((row) => ({
    item: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedAt: row.publishedAt,
      thumbnailUrl: videoThumbnailUrl({ ...row, hasHq: false, hasLq: false }),
    },
    score: Number(row.score),
  }))
}

async function searchEventsRaw(
  executor: Executor,
  query: string,
  limit: number,
): Promise<Array<SearchScoredRow<EventHit>>> {
  const rows = await executor.execute(sql`
    select e.id, e.slug, e.title, e.start_date as "startDate",
      greatest(
        case when bss_norm(e.title) = bss_norm(${query}) then 100 else 0 end,
        case when bss_norm(e.title) like bss_norm(${query}) || '%' then 80 else 0 end,
        case when similarity(bss_norm(e.title), bss_norm(${query})) > ${TRIGRAM_THRESHOLD}
          then round(50 * similarity(bss_norm(e.title), bss_norm(${query}))) else 0 end,
        case when coalesce(bss_norm(e.description), '') like '%' || bss_norm(${query}) || '%' then 20 else 0 end
      ) as score
    from events e
    where e.status = 'published'
      and (
        bss_norm(e.title) like '%' || bss_norm(${query}) || '%'
        or coalesce(bss_norm(e.description), '') like '%' || bss_norm(${query}) || '%'
        or similarity(bss_norm(e.title), bss_norm(${query})) > ${TRIGRAM_THRESHOLD}
      )
    order by score desc, e.start_date desc, e.id
    limit ${limit}
  `)
  return (rows.rows as unknown as Array<EventHit & { score: number }>).map(
    (row) => ({
      item: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        startDate: row.startDate,
      },
      score: Number(row.score),
    }),
  )
}

async function searchMembersRaw(
  executor: Executor,
  query: string,
  limit: number,
): Promise<Array<SearchScoredRow<MemberHit>>> {
  const rows = await executor.execute(sql`
    select m.sub, m.username, m.full_name as "fullName", m.nickname, m.avatar_url as "avatarUrl",
      greatest(
        case when bss_norm(m.full_name) = bss_norm(${query}) then 100 else 0 end,
        case when bss_norm(coalesce(m.nickname, '')) = bss_norm(${query}) and m.nickname is not null then 95 else 0 end,
        case when bss_norm(m.full_name) like bss_norm(${query}) || '%' then 80 else 0 end,
        case when similarity(bss_norm(m.full_name), bss_norm(${query})) > ${TRIGRAM_THRESHOLD}
          then round(50 * similarity(bss_norm(m.full_name), bss_norm(${query}))) else 0 end,
        case when coalesce(bss_norm(m.introduction), '') like '%' || bss_norm(${query}) || '%' then 20 else 0 end
      ) as score
    from member_cache m
    where m.deleted_at is null
      and (
        bss_norm(m.full_name) like '%' || bss_norm(${query}) || '%'
        or bss_norm(coalesce(m.nickname, '')) like '%' || bss_norm(${query}) || '%'
        or coalesce(bss_norm(m.introduction), '') like '%' || bss_norm(${query}) || '%'
        or similarity(bss_norm(m.full_name), bss_norm(${query})) > ${TRIGRAM_THRESHOLD}
      )
    order by score desc, m.full_name, m.sub
    limit ${limit}
  `)
  return (rows.rows as unknown as Array<MemberHit & { score: number }>).map(
    (row) => ({
      item: {
        sub: row.sub,
        username: row.username,
        fullName: row.fullName,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl,
      },
      score: Number(row.score),
    }),
  )
}

async function searchTagsRaw(
  executor: Executor,
  query: string,
  limit: number,
): Promise<Array<SearchScoredRow<TagHit>>> {
  const rows = await executor.execute(sql`
    select t.id, t.name,
      greatest(
        case when bss_norm(t.name) = bss_norm(${query}) then 100 else 0 end,
        case when bss_norm(t.name) like bss_norm(${query}) || '%' then 80 else 0 end,
        case when similarity(bss_norm(t.name), bss_norm(${query})) > ${TRIGRAM_THRESHOLD}
          then round(50 * similarity(bss_norm(t.name), bss_norm(${query}))) else 0 end
      ) as score
    from tags t
    where bss_norm(t.name) like '%' || bss_norm(${query}) || '%'
      or similarity(bss_norm(t.name), bss_norm(${query})) > ${TRIGRAM_THRESHOLD}
    order by score desc, t.name, t.id
    limit ${limit}
  `)
  return (rows.rows as unknown as Array<TagHit & { score: number }>).map(
    (row) => ({
      item: { id: row.id, name: row.name },
      score: Number(row.score),
    }),
  )
}

// ---------------------------------------------------------------------------
// Detailed video search and filtering (the basis of the /videos page)
// ---------------------------------------------------------------------------

export type VideoSort = 'published' | 'chronological' | 'mostviewed'

export interface VideoSearchFilters {
  viewer: Viewer
  /** Free text over title, description, guests and staff names. */
  query?: string
  /** Tag NAMES joined with `AND`: only videos having all the tags. */
  tagNames?: string[]
  eventId?: string
  recordedFrom?: string
  recordedTo?: string
  staffMemberSub?: string
  staffRoleId?: string
  sort?: VideoSort
  limit?: number
  offset?: number
}

export interface DetailedVideoHit extends VideoHit {
  recordedAt: string | null
  viewCount: number
}

export interface VideoSearchPage {
  items: Array<DetailedVideoHit>
  total: number
}

function orderSql(sort: VideoSort): string {
  if (sort === 'chronological') {
    return 'v.recorded_at desc nulls last, v.published_at desc nulls last, v.id'
  }
  if (sort === 'mostviewed') {
    return 'v.view_count desc, v.published_at desc nulls last, v.id'
  }
  return 'v.published_at desc nulls last, v.id'
}

/**
 * Stable, server-side paginated video filtering. Every condition is applied
 * in the SQL; visibility is filtered by the viewer's level.
 */
export async function searchVideosDetailed(
  executor: Executor,
  filters: VideoSearchFilters,
): Promise<VideoSearchPage> {
  const conditions: SQL[] = [
    sql`v.status = 'published'`,
    sql.raw(visibilitySql(filters.viewer)),
  ]

  const query = filters.query?.trim()
  if (query !== undefined && query.length >= MIN_QUERY_LENGTH) {
    conditions.push(sql`
      (bss_norm(v.title) like '%' || bss_norm(${query}) || '%'
       or coalesce(bss_norm(v.description), '') like '%' || bss_norm(${query}) || '%'
       or coalesce(bss_norm(v.guests), '') like '%' || bss_norm(${query}) || '%'
       or exists (
         select 1 from video_staff vs2 join member_cache mc2 on mc2.sub = vs2.member_sub
         where vs2.video_id = v.id and bss_norm(mc2.full_name) like '%' || bss_norm(${query}) || '%'
       ))`)
  }
  // Tags joined with AND: a relation must exist for every requested tag.
  for (const tagName of filters.tagNames ?? []) {
    conditions.push(sql`
      exists (
        select 1 from video_tags vt join tags t on t.id = vt.tag_id
        where vt.video_id = v.id and bss_norm(t.name) = bss_norm(${tagName})
      )`)
  }
  if (filters.eventId !== undefined) {
    conditions.push(sql`v.event_id = ${filters.eventId}`)
  }
  if (filters.recordedFrom !== undefined) {
    conditions.push(sql`v.recorded_at >= ${filters.recordedFrom}`)
  }
  if (filters.recordedTo !== undefined) {
    conditions.push(sql`v.recorded_at <= ${filters.recordedTo}`)
  }
  if (filters.staffMemberSub !== undefined) {
    conditions.push(sql`
      exists (select 1 from video_staff vs3 where vs3.video_id = v.id and vs3.member_sub = ${filters.staffMemberSub})`)
  }
  if (filters.staffRoleId !== undefined) {
    conditions.push(sql`
      exists (select 1 from video_staff vs4 where vs4.video_id = v.id and vs4.role_id = ${filters.staffRoleId})`)
  }

  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  const rows = await executor.execute(sql`
    select v.id, v.slug, v.title, v.encoding_group as "encodingGroup",
      v.base_filename as "baseFilename",
      v.published_at as "publishedAt", v.recorded_at as "recordedAt", v.view_count as "viewCount",
      count(*) over() as total
    from videos v
    where ${sql.join(conditions, sql` and `)}
    order by ${sql.raw(orderSql(filters.sort ?? 'published'))}
    limit ${limit} offset ${offset}
  `)

  const rawRows = rows.rows as unknown as Array<
    Omit<DetailedVideoHit, 'thumbnailUrl'> & VideoMediaRow & { total: number }
  >
  const first = rawRows.at(0)
  return {
    items: rawRows.map(
      ({ total: _total, encodingGroup, baseFilename, ...item }) => ({
        ...item,
        thumbnailUrl: videoThumbnailUrl({
          encodingGroup,
          baseFilename,
          hasHq: false,
          hasLq: false,
        }),
      }),
    ),
    total: rawRows.length > 0 ? Number(first?.total ?? 0) : 0,
  }
}

interface VideoMediaRow {
  encodingGroup: VideoEncodingGroup | null
  baseFilename: string | null
}
