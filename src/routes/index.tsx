import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { getHomepagePage } from '#/server/pages/homepage.ts'
import type {
  HomepageHeroVideo,
  HomepageStateDto,
  HomepageVideoCard,
} from '#/server/pages/homepage.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { formatEventIntervalHu } from '#/lib/format-date.ts'
import Thumbnail from '#/components/Thumbnail.tsx'
import VideoDetailPlayer from '#/components/VideoDetailPlayer.tsx'
import {
  SkeletonLine,
  ThumbnailCardSkeleton,
} from '#/components/PageStates.tsx'

const loadHomepage = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDefaultDb()
  return getHomepagePage(db)
})

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['homepage'],
      queryFn: loadHomepage,
    }),
  component: HomePage,
  // The placeholder stays visible while the loader is pending, not a plain text line.
  pendingComponent: HomepageSkeleton,
})

function HomePage() {
  // Per-minute check (spec 9.3): the homepage switches without a reload.
  const homeQuery = useQuery({
    queryKey: ['homepage'],
    queryFn: loadHomepage,
    refetchInterval: 60_000,
  })

  if (homeQuery.isPending) {
    return <HomepageSkeleton />
  }
  if (homeQuery.isError) {
    return (
      <main className="site-width py-[6dvh]">
        <p role="alert" className="text-center text-(--bss-text-secondary)">
          Hiba történt a főoldal betöltése közben. Próbáld újra később.
        </p>
      </main>
    )
  }

  return <HomepageContent state={homeQuery.data} />
}

function HomepageContent({ state }: { state: HomepageStateDto }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (container === null) return
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault()
        container.scrollLeft += event.deltaY
      }
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <main className="site-width">
      <div className="my-[5dvh] font-bank-gothic text-[clamp(1rem,10dvw,66px)] font-bold leading-none text-(--bss-text)">
        Budavári Schönherz Studió
      </div>

      {state.upcomingLive !== null && (
        <Link
          to="/"
          aria-label="Élő adás hamarosan"
          className="mb-[2dvh] block bg-(--orange) px-4 py-3 text-center font-bold text-white"
        >
          Adás hamarosan
        </Link>
      )}

      <section className="mb-[6dvh] grid grid-cols-1 gap-x-[3dvw] gap-y-[3dvh] md:grid-cols-[1.5fr_1fr]">
        {/* Hero */}
        {state.priority === 'live' && state.liveEmbedUrl !== null ? (
          <div>
            <h2 className="mb-[2dvh] text-3xl font-bold text-(--orange)">
              Élő adás
            </h2>
            <iframe
              src={state.liveEmbedUrl}
              title="Élő adás lejátszó"
              allowFullScreen
              className="aspect-video w-full bg-black"
            />
          </div>
        ) : state.hero !== null ? (
          <div className="max-w-4xl">
            <h2 className="mb-[2dvh] text-3xl font-bold text-(--orange)">
              Kiemelt videónk
            </h2>
            <HeroPlayer video={state.hero} />
          </div>
        ) : (
          <div>
            <h2 className="mb-[2dvh] text-3xl font-bold text-(--orange)">
              Legutóbbi videóink
            </h2>
            {state.sideVideos.length > 0 && (
              <HeroCard video={state.sideVideos[0]} />
            )}
          </div>
        )}

        {/* List next to the hero: five in live mode, six in highlight mode, the remainder otherwise */}
        <div>
          <h2 className="mb-[2dvh] text-3xl font-bold text-(--orange)">
            További friss videóink
          </h2>
          <div className="grid w-full grid-cols-1 gap-x-[3dvw] gap-y-[3dvh] md:grid-cols-2">
            {sideList(state).map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      </section>

      {/* Events */}
      <section className="mb-[10dvh]">
        <div className="flex items-baseline justify-between">
          <h2 className="mb-[2dvh] text-3xl font-bold text-(--orange)">
            Legutóbbi eseményeink
          </h2>
          <Link to="/events" className="nav-link font-bold text-(--orange)">
            Összes esemény
          </Link>
        </div>
        {state.events.length === 0 ? (
          <p className="py-6 text-(--bss-text-secondary)">
            Jelenleg nincs megjeleníthető esemény.
          </p>
        ) : (
          <div
            // A scroll container clips at its padding box, so without this
            // padding it would cut off the card shadows and the hover lift.
            className="-mx-3 flex flex-nowrap gap-[1dvw] overflow-x-auto px-3 pt-2 pb-10 scrollbar-hide *:shrink-0"
            ref={scrollRef}
          >
            {state.events.map((event) => (
              <Link
                key={event.id}
                to="/events/$slug"
                params={{ slug: event.slug }}
                className="card-surface hover-lift block w-[250px] shadow-[0_2px_6px_rgba(255,145,0,0.35)]"
              >
                <Thumbnail src={event.thumbnailUrl} alt={event.title} />
                <span className="block p-2 text-center font-bold text-(--bss-text-secondary)">
                  {event.title}
                  {event.startDate !== null && (
                    <span className="mt-1 block text-xs font-normal">
                      {formatEventIntervalHu(event.startDate, null)}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

/**
 * The homepage loading placeholder. The hero, the side list and the event
 * strip get the same grid and 16:9 ratio as the real content, so the
 * layout doesn't jump when content appears.
 */
function HomepageSkeleton() {
  return (
    <main
      className="site-width"
      role="status"
      aria-busy="true"
      aria-label="Főoldal betöltése…"
    >
      <span className="sr-only">Főoldal betöltése…</span>
      <div className="my-[5dvh] font-bank-gothic text-[clamp(1rem,10dvw,66px)] font-bold leading-none text-(--bss-text)">
        Budavári Schönherz Studió
      </div>

      <section className="mb-[6dvh] grid grid-cols-1 gap-x-[3dvw] gap-y-[3dvh] md:grid-cols-[1.5fr_1fr]">
        <div>
          <SkeletonLine className="mb-[2dvh] h-8 w-56" />
          <ThumbnailCardSkeleton />
        </div>
        <div>
          <SkeletonLine className="mb-[2dvh] h-8 w-64" />
          <div className="grid w-full grid-cols-1 gap-x-[3dvw] gap-y-[3dvh] md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <ThumbnailCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="mb-[10dvh]">
        <SkeletonLine className="mb-[2dvh] h-8 w-72" />
        <div className="flex flex-nowrap gap-[1dvw] overflow-hidden *:shrink-0">
          {Array.from({ length: 6 }, (_, index) => (
            <ThumbnailCardSkeleton
              key={index}
              lines={2}
              className="w-[250px]"
            />
          ))}
        </div>
      </section>
    </main>
  )
}

/**
 * In live and highlighted mode five recent public videos appear next to the
 * hero, in normal mode six; the hero must not repeat (spec 9.1).
 */
function sideList(state: HomepageStateDto) {
  if (state.priority === 'normal') {
    return state.hero !== null ? [] : state.sideVideos.slice(1, 6)
  }
  return state.sideVideos
}

function HeroCard({ video }: { video: HomepageVideoCard | null }) {
  if (video === null) {
    return null
  }
  return (
    <Link
      to="/videos/$slug"
      params={{ slug: video.slug }}
      className="group card-surface hover-lift block"
    >
      {/* The hero is the most important image on the page: load it eagerly. */}
      <Thumbnail src={video.thumbnailUrl} alt={video.title} loading="eager" />
      <span className="block truncate px-2 py-2 text-xl font-bold text-(--bss-text-secondary) group-hover:text-(--orange)">
        {video.title}
      </span>
    </Link>
  )
}

/**
 * Highlighted hero: the video plays right here on the homepage, and the title
 * under it opens the video page for the full view (description, staff,
 * related videos). Without an MP4 URL only the linked cover image remains.
 */
function HeroPlayer({ video }: { video: HomepageHeroVideo }) {
  if (video.videoUrl === null) {
    return <HeroCard video={video} />
  }
  return (
    // The videos are 16:9: the arbitrary variant reserves the frame before the
    // metadata arrives, so the page layout doesn't jump.
    <div className="card-surface [&_video]:aspect-video [&_video]:w-full">
      <VideoDetailPlayer
        videoId={video.id}
        videoUrl={video.videoUrl}
        posterUrl={video.thumbnailUrl}
        title={video.title}
      />
      <Link
        to="/videos/$slug"
        params={{ slug: video.slug }}
        className="flex items-center gap-2 px-2 py-2 text-xl font-bold text-(--bss-text-secondary) hover:text-(--orange) hover:underline"
      >
        <span className="truncate">{video.title}</span>
        {/* Points to the video page: there the video can be viewed with all
         * its data. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.5 2a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V2.707L6.354 9.854a.5.5 0 1 1-.708-.708L12.793 2.5H6a.5.5 0 0 1-.5-.5"
          />
          <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 1 0v4A1.5 1.5 0 0 1 11.5 15h-8A1.5 1.5 0 0 1 2 13.5z" />
        </svg>
      </Link>
    </div>
  )
}

function VideoCard({ video }: { video: HomepageVideoCard }) {
  return (
    <Link
      to="/videos/$slug"
      params={{ slug: video.slug }}
      className="group card-surface hover-lift block"
    >
      <Thumbnail src={video.thumbnailUrl} alt={video.title} />
      <span className="block truncate px-2 py-1 text-(--bss-text-secondary) group-hover:text-(--orange)">
        {video.title}
      </span>
    </Link>
  )
}
