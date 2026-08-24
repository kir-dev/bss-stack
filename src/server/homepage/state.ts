import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { buildYoutubeNocookieEmbedUrl } from '#/server/media/youtube.ts'
import { events, liveStreams, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { getHighlightedVideoId } from './highlight.ts'

const PUBLIC_PUBLISHED = [
  eq(videos.status, 'published'),
  eq(videos.visibility, 'public'),
]

async function latestPublicVideos(
  executor: Executor,
  limit: number,
  excludeVideoId?: string | null,
): Promise<Array<typeof videos.$inferSelect>> {
  const conditions = [...PUBLIC_PUBLISHED]
  if (excludeVideoId !== undefined && excludeVideoId !== null) {
    conditions.push(ne(videos.id, excludeVideoId))
  }
  return executor
    .select()
    .from(videos)
    .where(and(...conditions))
    .orderBy(desc(videos.publishedAt), desc(videos.id))
    .limit(limit)
}

async function latestPublicEvents(
  executor: Executor,
  limit: number,
): Promise<Array<typeof events.$inferSelect>> {
  return executor
    .select()
    .from(events)
    .where(eq(events.status, 'published'))
    .orderBy(desc(events.startDate), desc(events.id))
    .limit(limit)
}

/**
 * `Coming up soon` bar (spec 9.3): shown during the 24 hours before the start.
 * The bar does not replace the normal or highlighted hero content.
 */
export async function getUpcomingLive(
  executor: Executor,
  options: { now: Date; withinMs?: number },
): Promise<{
  stream: typeof liveStreams.$inferSelect
  embedUrl: string
} | null> {
  const withinMs = options.withinMs ?? 24 * 60 * 60 * 1000
  const horizon = new Date(options.now.getTime() + withinMs)
  const rows = await executor
    .select()
    .from(liveStreams)
    .where(
      and(
        eq(liveStreams.status, 'scheduled'),
        gte(liveStreams.startsAt, options.now),
        lte(liveStreams.startsAt, horizon),
      ),
    )
    .orderBy(liveStreams.startsAt)
    .limit(1)
  const stream = rows.at(0)
  if (stream === undefined) {
    return null
  }
  return {
    stream,
    embedUrl: buildYoutubeNocookieEmbedUrl(stream.youtubeVideoId),
  }
}

export interface HomepageState {
  priority: 'live' | 'highlight' | 'normal'
  /** The nocookie embed URL when a live is active. */
  liveEmbedUrl?: string
  liveStream?: typeof liveStreams.$inferSelect
  /** The hero video in highlighted state. */
  heroVideo?: typeof videos.$inferSelect
  /** Five latest public videos in live state, six in highlight and normal state. */
  sideVideos: Array<typeof videos.$inferSelect>
  events: Array<typeof events.$inferSelect>
  /** `Coming up soon` bar data, if there is a schedule starting within 24 hours. */
  upcomingLive?: { startsAt: Date; embedUrl: string }
}

/**
 * Homepage computed priority (spec 9.1): active live > highlighted video > normal.
 * Every query narrows to published and public videos in SQL.
 */
export async function getHomepageState(
  executor: Executor,
  options: { now: Date },
): Promise<HomepageState> {
  const now = options.now

  const activeLiveRows = await executor
    .select()
    .from(liveStreams)
    .where(
      and(
        sql`${liveStreams.status} = 'active'`,
        lte(liveStreams.startsAt, now),
        gte(liveStreams.endsAt, now),
      ),
    )
    .orderBy(desc(liveStreams.activatedAt))
    .limit(1)
  const activeLive = activeLiveRows.at(0)

  if (activeLive === undefined) {
    const highlightedId = await getHighlightedVideoId(executor)
    if (highlightedId !== null) {
      const heroRows = await executor
        .select()
        .from(videos)
        .where(and(...PUBLIC_PUBLISHED, eq(videos.id, highlightedId)))
        .limit(1)
      const heroVideo = heroRows.at(0)
      // A non-public or archived video must not stay highlighted even for display.
      if (heroVideo !== undefined) {
        return {
          priority: 'highlight',
          heroVideo,
          // The highlighted hero shows an inline player, so the list next to
          // it fills three rows of two instead of stopping at five.
          sideVideos: await latestPublicVideos(executor, 6, heroVideo.id),
          events: await latestPublicEvents(executor, 6),
          ...(await upcomingField(executor, now)),
        }
      }
    }
    return {
      priority: 'normal',
      sideVideos: await latestPublicVideos(executor, 6),
      events: await latestPublicEvents(executor, 6),
      ...(await upcomingField(executor, now)),
    }
  }

  return {
    priority: 'live',
    liveStream: activeLive,
    liveEmbedUrl: buildYoutubeNocookieEmbedUrl(activeLive.youtubeVideoId),
    sideVideos: await latestPublicVideos(executor, 5),
    events: await latestPublicEvents(executor, 6),
    ...(await upcomingField(executor, now)),
  }
}

async function upcomingField(
  executor: Executor,
  now: Date,
): Promise<{ upcomingLive?: { startsAt: Date; embedUrl: string } }> {
  const upcoming = await getUpcomingLive(executor, { now })
  if (upcoming === null) {
    return {}
  }
  return {
    upcomingLive: {
      startsAt: upcoming.stream.startsAt,
      embedUrl: upcoming.embedUrl,
    },
  }
}
