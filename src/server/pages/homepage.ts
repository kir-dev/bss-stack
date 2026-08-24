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
  /** Az esemény saját borítóképe, hiányában a legfrissebb publikus videójáé. */
  thumbnailUrl: string | null
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

  // A főoldal névtelen nézőként fut, ezért a fallback borítókép csak publikus
  // videóból jöhet – ugyanaz a szabály, mint a publikus eseménylistán.
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
