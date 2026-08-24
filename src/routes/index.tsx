import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { getHomepagePage } from '#/server/pages/homepage.ts'
import type {
  HomepageStateDto,
  HomepageVideoCard,
} from '#/server/pages/homepage.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { formatEventIntervalHu } from '#/lib/format-date.ts'

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
})

function HomePage() {
  // Percenkénti ellenőrzés (spec 9.3): a homepage frissítés nélkül vált.
  const homeQuery = useQuery({
    queryKey: ['homepage'],
    queryFn: loadHomepage,
    refetchInterval: 60_000,
  })

  if (homeQuery.isPending) {
    return (
      <main className="mx-auto w-[90dvw] py-[6dvh]">
        <p role="status" className="text-center text-(--bss-text-secondary)">
          Betöltés…
        </p>
      </main>
    )
  }
  if (homeQuery.isError) {
    return (
      <main className="mx-auto w-[90dvw] py-[6dvh]">
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
    <main className="mx-auto w-[90dvw]">
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
          <div>
            <h2 className="mb-[2dvh] text-3xl font-bold text-(--orange)">
              Kiemelt videónk
            </h2>
            <HeroCard video={state.hero} />
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

        {/* Hero melletti lista: live/kiemelt esetén öt, normálban a maradék */}
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

      {/* Események */}
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
            className="flex flex-nowrap gap-[1dvw] overflow-x-auto scrollbar-hide *:shrink-0"
            ref={scrollRef}
          >
            {state.events.map((event) => (
              <Link
                key={event.id}
                to="/events/$slug"
                params={{ slug: event.slug }}
                className="hover-lift block w-[250px] shadow-[0_2px_6px_rgba(255,145,0,0.35)]"
              >
                <img
                  src={'/test_event.png'}
                  alt={event.title}
                  className="h-[180px] w-full object-cover"
                />
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
 * Live és kiemelt állapotban a hero mellett öt, normál állapotban hat
 * legutóbbi publikus videó jelenik meg; a hero nem ismétlődhet (spec 9.1).
 */
function sideList(state: HomepageStateDto) {
  if (state.priority === 'normal') {
    return state.hero !== null ? [] : state.sideVideos.slice(1, 6)
  }
  return state.sideVideos
}

function HeroCard({ video }: { video: HomepageStateDto['hero'] }) {
  if (video === null) {
    return null
  }
  return (
    <Link
      to="/videos/$slug"
      params={{ slug: video.slug }}
      className="group hover-lift block"
    >
      <img
        src={video.thumbnailUrl ?? '/video-thumbnail.png'}
        alt={video.title}
        className="block max-h-[530px] w-full object-cover"
      />
      <span className="block truncate px-2 py-2 text-xl font-bold text-(--bss-text-secondary) group-hover:text-(--orange)">
        {video.title}
      </span>
    </Link>
  )
}

function VideoCard({ video }: { video: HomepageVideoCard }) {
  return (
    <Link
      to="/videos/$slug"
      params={{ slug: video.slug }}
      className="group hover-lift block"
    >
      <img
        src={video.thumbnailUrl ?? '/video-thumbnail.png'}
        alt={video.title}
        className="block h-auto w-full object-cover"
      />
      <span className="block truncate px-2 py-1 text-(--bss-text-secondary) group-hover:text-(--orange)">
        {video.title}
      </span>
    </Link>
  )
}
