import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { memberCache, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { TRASH_RETENTION_DAYS } from '#/server/videos/purge.ts'
import { videoThumbnailUrl } from '#/server/media/video-media.ts'

export interface TrashListItem {
  id: string
  slug: string
  title: string
  thumbnailUrl: string | null
  trashedAt: Date
  trashedByName: string | null
  version: number
}

export interface TrashPage {
  items: Array<TrashListItem & { remainingDays: number }>
  total: number
  page: number
  perPage: number
  totalPages: number
  /** Number of records already due to be permanently deleted by the daily job. */
  expiredCount: number
}

export function remainingTrashDays(trashedAt: Date, now: Date): number {
  const elapsedMs = now.getTime() - trashedAt.getTime()
  const retentionMs = TRASH_RETENTION_DAYS * 86_400_000
  return Math.max(0, Math.ceil((retentionMs - elapsedMs) / 86_400_000))
}

export async function getTrashPage(
  executor: Executor,
  query: { page: number; perPage: number },
): Promise<TrashPage> {
  const where = eq(videos.status, 'trash')

  const [items, countRows, expiredRows] = await Promise.all([
    executor
      .select({
        id: videos.id,
        slug: videos.slug,
        title: videos.title,
        encodingGroup: videos.encodingGroup,
        baseFilename: videos.baseFilename,
        trashedAt: videos.trashedAt,
        trashedByName: memberCache.fullName,
        version: videos.version,
      })
      .from(videos)
      .leftJoin(memberCache, eq(memberCache.sub, videos.trashedBy))
      .where(where)
      .orderBy(desc(videos.trashedAt), desc(videos.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .where(where),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .where(
        and(
          eq(videos.status, 'trash'),
          lte(
            videos.trashedAt,
            new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000),
          ),
        ),
      ),
  ])

  const total = countRows.at(0)?.count ?? 0
  const now = new Date()
  return {
    items: items.map((item) => ({
      ...item,
      thumbnailUrl: videoThumbnailUrl({ ...item, hasHq: false, hasLq: false }),
      trashedAt: item.trashedAt as unknown as Date,
      remainingDays:
        item.trashedAt !== null ? remainingTrashDays(item.trashedAt, now) : 0,
    })),
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: query.perPage > 0 ? Math.ceil(total / query.perPage) : 0,
    expiredCount: expiredRows.at(0)?.count ?? 0,
  }
}
