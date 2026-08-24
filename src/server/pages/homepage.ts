import type { Executor } from '#/server/shared/db-executor.ts'
import { getHomepageState, getUpcomingLive } from '#/server/homepage/state.ts'
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
  startDate: string | null
}

export interface HomepageStateDto {
  priority: 'live' | 'highlight' | 'normal'
  /** Live esetén a YouTube nocookie embed URL. */
  liveEmbedUrl: string | null
  liveTitle: string | null
  hero: HomepageVideoCard | null
  sideVideos: Array<HomepageVideoCard>
  events: Array<HomepageEventCard>
  /** `Adás hamarosan` sáv: legfeljebb 24 órán belül kezdődő ütemezés. */
  upcomingLive: { startsAtIso: string; embedUrl: string } | null
}

/**
 * A főoldal számított prioritású állapota (spec 9.1), kliensnek szerializálva.
 * A percenkénti újratöltés frissítés nélkül vált a három állapot között.
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
