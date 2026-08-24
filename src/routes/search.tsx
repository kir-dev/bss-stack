import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { MIN_QUERY_LENGTH, search } from '#/server/search/service.ts'
import { getVideoListPage } from '#/server/pages/video-list.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

const SEARCH_TABS = [
  { key: 'all', label: 'Összes' },
  { key: 'videos', label: 'Videók' },
  { key: 'events', label: 'Események' },
  { key: 'members', label: 'Tagok' },
] as const

type SearchTab = (typeof SEARCH_TABS)[number]['key']

const loadSearchResults = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(async ({ data: query }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    // Az Összes fül típusonként legfeljebb tíz találatot mutat (spec 11.3).
    return search(db, viewer, query, { limitPerType: 10 })
  })

const loadVideoHits = createServerFn({ method: 'GET' })
  .validator((query: string) => query)
  .handler(async ({ data: query }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    return getVideoListPage(db, viewer, {
      q: query,
      sort: 'published',
      page: 1,
      perPage: 50,
      tagNames: [],
      eventSlug: '',
      recordedFrom: '',
      recordedTo: '',
      staffMemberSub: '',
      staffRoleId: '',
    })
  })

type SearchRouteSearch = { q?: string; tab?: SearchTab }

export const Route = createFileRoute('/search')({
  validateSearch: (rawSearch: Record<string, unknown>): SearchRouteSearch => {
    const q = rawSearch['q']
    const tab = rawSearch['tab']
    const knownTabs = SEARCH_TABS.map((entry) => entry.key)
    return {
      q: typeof q === 'string' ? q : '',
      tab:
        typeof tab === 'string' && (knownTabs as string[]).includes(tab)
          ? (tab as SearchTab)
          : undefined,
    }
  },
  loaderDeps: ({ search: routeSearch }) => ({ routeSearch }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['search', deps.routeSearch],
      queryFn: async () => {
        const query = deps.routeSearch.q?.trim() ?? ''
        if (query.length < MIN_QUERY_LENGTH) {
          return null
        }
        const [results, videos] = await Promise.all([
          loadSearchResults({ data: query }),
          loadVideoHits({ data: query }),
        ])
        return { query, results, videos }
      },
    }),
  component: SearchPage,
})

function SearchPage() {
  const searchParams = Route.useSearch()
  const data = Route.useLoaderData()
  const query = searchParams.q ?? ''
  const activeTab: SearchTab = searchParams.tab ?? 'all'

  return (
    <main className="mx-auto w-[90dvw] my-[4dvh]">
      {/* Technikai oldal: a keresés nem indexelhető (spec 16). */}
      <meta name="robots" content="noindex, nofollow" />
      <title>Keresés | BSS</title>
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">
        Keresés{query !== '' ? `: „${query}”` : ''}
      </h1>

      <nav aria-label="Kereső fülek" className="mb-6 flex gap-6">
        {SEARCH_TABS.map((tabEntry) => (
          <Link
            key={tabEntry.key}
            to="/search"
            search={{
              q: query,
              tab: tabEntry.key === 'all' ? undefined : tabEntry.key,
            }}
            className={`font-bold ${
              activeTab === tabEntry.key
                ? 'text-(--orange) underline'
                : 'text-(--bss-text-secondary)'
            }`}
          >
            {tabEntry.label}
          </Link>
        ))}
      </nav>

      {(data === null || query.trim().length < MIN_QUERY_LENGTH) && (
        <div className="max-w-prose py-[6dvh]">
          <p className="text-xl font-bold text-(--bss-text)">
            Kezdd el a keresést legalább két karakterrel.
          </p>
          <p className="mt-3 text-(--bss-text-secondary)">
            A keresés kis- és nagybetűtől, valamint ékezettől független, és a
            kisebb elgépeléseket is kezeli. A felhasznált zenékben nincs
            keresés.
          </p>
          <p className="mt-3">
            <Link
              to="/videos"
              search={{}}
              className="font-bold text-(--orange) underline"
            >
              Részletes videószűrő megnyitása
            </Link>
          </p>
        </div>
      )}

      {data !== null && query.trim().length >= MIN_QUERY_LENGTH && (
        <>
          {activeTab === 'all' && (
            <>
              <ResultSection title="Videók">
                <ul className="mt-2 space-y-1">
                  {data.results.videos.map(({ item }) => (
                    <li key={item.id}>
                      <HitLink
                        href={`/videos/${item.slug}`}
                        label={item.title}
                      />
                    </li>
                  ))}
                </ul>
              </ResultSection>
              <ResultSection title="Események">
                <ul className="mt-2 space-y-1">
                  {data.results.events.map(({ item }) => (
                    <li key={item.id}>
                      <HitLink
                        href={`/events/${item.slug}`}
                        label={item.title}
                      />
                    </li>
                  ))}
                </ul>
              </ResultSection>
              <ResultSection title="Tagok">
                <ul className="mt-2 space-y-1">
                  {data.results.members.map(({ item }) => (
                    <li key={item.sub}>
                      <HitLink
                        href={`/members/${item.username}`}
                        label={`${item.fullName} (Tag)`}
                      />
                    </li>
                  ))}
                </ul>
              </ResultSection>
              <ResultSection title="Címkék">
                <ul className="mt-2 space-y-1">
                  {data.results.tags.map(({ item }) => (
                    <li key={item.id}>
                      <HitLink
                        href={`/videos?tags=${encodeURIComponent(item.name)}`}
                        label={`${item.name} (Címke)`}
                      />
                    </li>
                  ))}
                </ul>
              </ResultSection>
              {countAll(data.results) === 0 && <NoResults />}
            </>
          )}

          {activeTab === 'videos' && (
            <>
              {data.videos.items.length === 0 ? (
                <NoResults />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {data.videos.items.map((video) => (
                    <Link
                      key={video.id}
                      to="/videos/$slug"
                      params={{ slug: video.slug }}
                      className="group block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)]"
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
                  ))}
                </div>
              )}
              <p className="mt-4">
                <Link
                  to="/videos"
                  search={{ q: query }}
                  className="font-bold text-(--orange) underline"
                >
                  Részletes szűrőkkel folytatás
                </Link>
              </p>
            </>
          )}

          {activeTab === 'events' && (
            <>
              {data.results.events.length === 0 ? (
                <NoResults />
              ) : (
                <ul className="space-y-1">
                  {data.results.events.map(({ item }) => (
                    <li key={item.id}>
                      <HitLink
                        href={`/events/${item.slug}`}
                        label={item.title}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {activeTab === 'members' && (
            <>
              {data.results.members.length === 0 ? (
                <NoResults />
              ) : (
                <ul className="space-y-1">
                  {data.results.members.map(({ item }) => (
                    <li key={item.sub}>
                      <HitLink
                        href={`/members/${item.username}`}
                        label={`${item.fullName} (Tag)`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

function countAll(results: {
  videos: unknown[]
  events: unknown[]
  members: unknown[]
  tags: unknown[]
}): number {
  return (
    results.videos.length +
    results.events.length +
    results.members.length +
    results.tags.length
  )
}

function ResultSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-(--bss-text)">{title}</h2>
      {children}
    </section>
  )
}

function HitLink({ href, label }: { href: string; label: string }) {
  const internal = href.startsWith('/videos?')
    ? null
    : href.startsWith('/videos/')
      ? { to: '/videos/$slug' as const, slug: href.replace('/videos/', '') }
      : href.startsWith('/events/')
        ? { to: '/events/$slug' as const, slug: href.replace('/events/', '') }
        : href.startsWith('/members/')
          ? {
              to: '/members/$slug' as const,
              slug: href.replace('/members/', ''),
            }
          : null

  if (internal !== null) {
    return (
      <Link
        to={internal.to}
        params={{ slug: internal.slug }}
        className="underline hover:text-(--orange)"
      >
        {label}
      </Link>
    )
  }

  if (href.startsWith('/videos?tags=')) {
    const tagName = decodeURIComponent(href.replace('/videos?tags=', ''))
    return (
      <Link
        to="/videos"
        search={{ tags: [tagName] }}
        className="underline hover:text-(--orange)"
      >
        {label}
      </Link>
    )
  }

  return (
    <a href={href} className="underline hover:text-(--orange)">
      {label}
    </a>
  )
}

function NoResults() {
  return (
    <div className="py-[6dvh] text-center">
      <p className="text-xl font-bold text-(--bss-text)">Nincs találat</p>
      <p className="mt-3 text-(--bss-text-secondary)">
        Próbálj másik kifejezést, vagy használd a részletes videószűrőt.
      </p>
    </div>
  )
}
