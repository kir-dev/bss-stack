import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { aboutPageVideos, liveStreams, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { getHighlightedVideoId } from '#/server/homepage/highlight.ts'

/**
 * Load data for the Live and highlight admin pages (BSS-031). Only
 * leadership may call it — both the route guard and the API endpoints verify this.
 */

export interface HomepageAdminData {
  highlight: {
    videoId: string | null
    title: string | null
  }
  live: Array<{
    id: string
    youtubeVideoId: string
    startsAt: Date
    endsAt: Date
    status: string
    activationError: string | null
  }>
  about: Array<{
    videoId: string
    position: number
    title: string | null
    /** Marks an invalid (archived/trashed/non-public) entry. */
    valid: boolean
  }>
  /** Videos selectable for highlight and About: published + public. */
  selectableVideos: Array<{
    id: string
    title: string
    publishedAt: Date | null
  }>
}

export async function getHomepageAdminData(
  executor: Executor,
): Promise<HomepageAdminData> {
  const highlightedVideoId = await getHighlightedVideoId(executor)

  const [liveRows, aboutRows, selectable] = await Promise.all([
    executor.select().from(liveStreams).orderBy(desc(liveStreams.startsAt)),
    executor
      .select({
        videoId: aboutPageVideos.videoId,
        position: aboutPageVideos.position,
        title: videos.title,
        status: videos.status,
        visibility: videos.visibility,
      })
      .from(aboutPageVideos)
      .leftJoin(videos, eq(videos.id, aboutPageVideos.videoId))
      .orderBy(asc(aboutPageVideos.position)),
    executor
      .select({
        id: videos.id,
        title: videos.title,
        publishedAt: videos.publishedAt,
      })
      .from(videos)
      .where(
        and(eq(videos.status, 'published'), eq(videos.visibility, 'public')),
      )
      .orderBy(desc(videos.publishedAt))
      .limit(500),
  ])

  let highlightTitle: string | null = null
  if (highlightedVideoId !== null) {
    const rows = await executor
      .select({ title: videos.title })
      .from(videos)
      .where(eq(videos.id, highlightedVideoId))
      .limit(1)
    highlightTitle = rows.at(0)?.title ?? null
  }

  return {
    highlight: { videoId: highlightedVideoId, title: highlightTitle },
    live: liveRows.map((row) => ({
      id: row.id,
      youtubeVideoId: row.youtubeVideoId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      activationError: row.activationError,
    })),
    about: aboutRows.map((row) => ({
      videoId: row.videoId,
      position: row.position,
      title: row.title,
      valid:
        row.status === 'published' &&
        row.visibility === 'public' &&
        row.title !== null,
    })),
    selectableVideos: selectable,
  }
}

/** Leadership preview of the About page: valid entries of the configured list. */
export async function resolveAboutTitles(
  executor: Executor,
  videoIds: readonly string[],
): Promise<Map<string, string>> {
  if (videoIds.length === 0) {
    return new Map()
  }
  const rows = await executor
    .select({ id: videos.id, title: videos.title })
    .from(videos)
    .where(inArray(videos.id, [...videoIds]))
  return new Map(rows.map((row) => [row.id, row.title]))
}
