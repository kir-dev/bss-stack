import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_EVENT_PAGE_SIZE,
  getEventListPage,
} from '#/server/pages/event-list.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { EmptyState } from '#/components/PageStates.tsx'

const loadEventList = createServerFn({ method: 'GET' })
  .validator((input: { page?: number; perPage?: number }) => input)
  .handler(async ({ data }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    return getEventListPage(db, viewer, data)
  })

type EventListSearch = { page?: string; perPage?: string }

export const Route = createFileRoute('/events/')({
  validateSearch: (search: Record<string, unknown>): EventListSearch => {
    const pick = (key: string): string | undefined => {
      const value = search[key]
      return typeof value === 'string' && value !== '' ? value : undefined
    }
    return { page: pick('page'), perPage: pick('perPage') }
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['event-list', deps.search],
      queryFn: () =>
        loadEventList({
          data: {
            page:
              deps.search.page === undefined
                ? undefined
                : Number(deps.search.page),
            perPage:
              deps.search.perPage === undefined
                ? undefined
                : Number(deps.search.perPage),
          },
        }),
    }),
  component: EventListPageComponent,
})

function EventListPageComponent() {
  const search = Route.useSearch()
  const listQuery = useQuery({
    queryKey: ['event-list', search],
    queryFn: () =>
      loadEventList({
        data: {
          page: search.page === undefined ? undefined : Number(search.page),
          perPage:
            search.perPage === undefined ? undefined : Number(search.perPage),
        },
      }),
  })

  const page = Number(search.page ?? '1') || 1
  const perPage = Number(search.perPage ?? String(DEFAULT_EVENT_PAGE_SIZE))

  return (
    <main className="mx-auto w-[90dvw] my-[4dvh]">
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">Események</h1>

      {listQuery.isPending && (
        <p
          role="status"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Betöltés…
        </p>
      )}
      {listQuery.isError && (
        <p
          role="alert"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Hiba történt az események betöltése közben. Próbáld újra később.
        </p>
      )}
      {listQuery.isSuccess &&
        (listQuery.data.items.length === 0 ? (
          <EmptyState
            title="Nincs megjeleníthető esemény"
            description="Jelenleg nincs publikált eseményünk. Nézz vissza később!"
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {listQuery.data.items.map((item) => (
                <Link
                  key={item.id}
                  to="/events/$slug"
                  params={{ slug: item.slug }}
                  className="group relative block shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                >
                  <img
                    src={item.thumbnailUrl ?? '/video-thumbnail.png'}
                    alt={item.title}
                    className="block h-auto w-full object-cover"
                  />
                  <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-1 text-xs font-bold text-white">
                    {item.visibleVideoCount} videó
                  </span>
                  <span className="block px-2 py-1 font-bold text-(--bss-text-secondary) group-hover:text-(--orange)">
                    {item.title}
                  </span>
                </Link>
              ))}
            </div>
            <EventPagination
              page={page}
              totalPages={listQuery.data.totalPages}
              perPage={perPage}
            />
          </>
        ))}
    </main>
  )
}

function EventPagination({
  page,
  totalPages,
  perPage,
}: {
  page: number
  totalPages: number
  perPage: number
}) {
  if (totalPages <= 1) {
    return null
  }
  return (
    <nav aria-label="Eseménylapozás" className="mt-8 flex justify-center gap-2">
      {Array.from({ length: totalPages }, (_, index) => index + 1).map(
        (value) => (
          <Link
            key={value}
            to="/events"
            search={{
              page: value === 1 ? undefined : String(value),
              perPage:
                perPage === DEFAULT_EVENT_PAGE_SIZE
                  ? undefined
                  : String(perPage),
            }}
            aria-current={value === page ? 'page' : undefined}
            className={`h-10 w-10 text-center leading-10 ${
              value === page
                ? 'font-bold text-(--orange)'
                : 'text-(--bss-text-secondary)'
            }`}
          >
            {value}
          </Link>
        ),
      )}
    </nav>
  )
}
