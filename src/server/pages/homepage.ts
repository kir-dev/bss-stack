import type { Executor } from '#/server/shared/db-executor.ts'
import { getHomepageState, getUpcomingLive } from '#/server/homepage/state.ts'
import { latestVisibleThumbnailByEvent } from '#/server/pages/event-list.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import { systemClock } from '#/lib/clock.ts'

export interface HomepageVideoCard {
  id: string
  slug: string
  title: string
  thumbnailUrl: string | null
}

export interface HomepageEventCard {
  id: string
  slug: string
  title: string
  /** The event's own cover image, or that of its most recent public video if missing. */
  thumbnailUrl: string | null
  startDate: string | null
}

export interface HomepageStateDto {
  priority: 'live' | 'highlight' | 'normal'
  /** The YouTube nocookie embed URL in live mode. */
  liveEmbedUrl: string | null
  liveTitle: string | null
  hero: HomepageVideoCard | null
  sideVideos: Array<HomepageVideoCard>
  events: Array<HomepageEventCard>
  /** `On air soon` strip: schedule starting within 24 hours at most. */
  upcomingLive: { startsAtIso: string; embedUrl: string } | null
}

/**
 * The homepage state with computed priority (spec 9.1), serialized for the client.
 * The per-minute reload switches between the three states without refreshing.
 */
export async function getHomepagePage(
  executor: Executor,
  options: { now?: Date } = {},
): Promise<HomepageStateDto> {
  const now = options.now ?? systemClock.now()
  const state = await getHomepageState(executor, { now })
  const toCard = (
    video: (typeof state.sideVideos)[number],
  ): HomepageVideoCard => ({
    id: video.id,
    slug: video.slug,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
  })

  // The homepage runs as an anonymous viewer, so the fallback cover image can
  // only come from a public video – the same rule as on the public event list.
  const eventThumbs =
    state.events.length === 0
      ? new Map<string, string>()
      : await latestVisibleThumbnailByEvent(
          executor,
          anonymousViewer(),
          state.events.map((event) => event.id),
        )

  const upcoming =
    state.upcomingLive ??
    (await (async () => {
      const result = await getUpcomingLive(executor, { now })
      return result === null
        ? undefined
        : { startsAt: result.stream.startsAt, embedUrl: result.embedUrl }
    })())

  return {
    priority: state.priority,
    liveEmbedUrl: state.liveEmbedUrl ?? null,
    liveTitle:
      state.liveStream !== undefined
        ? `Élő adás – ${state.liveStream.startsAt.toISOString().slice(0, 16).replace('T', ' ')}`
        : null,
    hero: state.heroVideo !== undefined ? toCard(state.heroVideo) : null,
    sideVideos: state.sideVideos.map(toCard),
    events: state.events.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      thumbnailUrl: event.thumbnailUrl ?? eventThumbs.get(event.id) ?? null,
      startDate: event.startDate,
    })),
    upcomingLive:
      upcoming !== undefined && state.priority !== 'live'
        ? {
            startsAtIso: upcoming.startsAt.toISOString(),
            embedUrl: upcoming.embedUrl,
          }
        : null,
  }
}
