import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  getAdminEventList,
  parseAdminEventFilters,
} from '#/server/admin/event-list.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import {
  parsePaginationNumber,
  parseSearchPage,
} from '#/server/shared/pagination.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import { ResponsiveTable } from '#/components/admin/ResponsiveTable.tsx'
import type { AdminColumn } from '#/components/admin/ResponsiveTable.tsx'
import type { AdminEventListItem } from '#/server/admin/event-list.ts'
import { eventStatusLabel } from '#/lib/admin-labels.ts'
import { formatEventIntervalHu } from '#/lib/format-date.ts'

const loadAdminEventList = createServerFn({ method: 'GET' })
  .validator(
    (input: Record<string, string | number | undefined> | undefined) =>
      input ?? {},
  )
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getAdminEventList(db, {
      page: parsePaginationNumber(data['page'], 1),
      perPage: parsePaginationNumber(data['perPage'], 25),
      filters: parseAdminEventFilters(data),
    })
  })

// Típus-alias (nem interface), hogy a szerverfüggvény `Record` paraméterébe
// implicit indexszignatúrával átadható legyen.
type AdminEventSearch = {
  q?: string
  status?: string
  from?: string
  to?: string
  page?: number
}

export const Route = createFileRoute('/admin/events/')({
  validateSearch: (search: Record<string, unknown>): AdminEventSearch => ({
    q: pickString(search, 'q'),
    status: pickString(search, 'status'),
    from: pickString(search, 'from'),
    to: pickString(search, 'to'),
    page: parseSearchPage(search['page']),
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-event-list', deps.search],
      queryFn: () => loadAdminEventList({ data: deps.search }),
    }),
  component: AdminEventListPage,
})

function pickString(
  search: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = search[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function AdminEventListPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const listQuery = useQuery({
    queryKey: ['admin-event-list', search],
    queryFn: () => loadAdminEventList({ data: search }),
  })

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-(--bss-text)">Események</h1>
        <Link
          to="/admin/events/new"
          className="rounded bg-(--orange) px-4 py-2 text-sm font-bold text-white"
        >
          Új esemény
        </Link>
      </div>

      <EventFilters
        search={search}
        onApply={(patch) =>
          navigate({
            search: (prev) => ({ ...prev, ...patch, page: undefined }),
          })
        }
      />

      {listQuery.isPending && <LoadingState />}
      {listQuery.isError && (
        <ErrorState label="Hiba történt az események betöltése közben. Próbáld újra később." />
      )}
      {listQuery.isSuccess &&
        (listQuery.data.items.length === 0 ? (
          <div className="py-[6dvh] text-center text-(--bss-text-secondary)">
            {search.q !== undefined ||
            search.status !== undefined ||
            search.from !== undefined ||
            search.to !== undefined
              ? 'Nincs találat a megadott szűrőkkel.'
              : 'Még nincs esemény.'}
          </div>
        ) : (
          <>
            <ResponsiveTable
              columns={eventColumns}
              rows={listQuery.data.items}
              emptyTitle="Nincs találat."
            />
            <nav
              aria-label="Oldalazás"
              className="mt-4 flex items-center gap-2 text-sm"
            >
              <button
                type="button"
                disabled={listQuery.data.page <= 1}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      page:
                        listQuery.data.page - 1 <= 1
                          ? undefined
                          : listQuery.data.page - 1,
                    }),
                  })
                }
                className="rounded border border-(--nav-border-b) px-3 py-1 disabled:opacity-30"
              >
                ‹ Előző
              </button>
              <span className="text-(--bss-text-secondary)">
                {listQuery.data.page}. /{' '}
                {Math.max(listQuery.data.totalPages, 1)}. oldal
              </span>
              <button
                type="button"
                disabled={listQuery.data.page >= listQuery.data.totalPages}
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      page: listQuery.data.page + 1,
                    }),
                  })
                }
                className="rounded border border-(--nav-border-b) px-3 py-1 disabled:opacity-30"
              >
                Következő ›
              </button>
            </nav>
          </>
        ))}
    </main>
  )
}

const eventColumns: Array<AdminColumn<AdminEventListItem>> = [
  {
    key: 'title',
    header: 'Cím',
    primary: true,
    render: (row) => (
      <Link
        to="/admin/events/$id"
        params={{ id: row.id }}
        className="font-bold hover:text-(--orange)"
      >
        {row.title}
      </Link>
    ),
  },
  {
    key: 'date',
    header: 'Dátum',
    render: (row) =>
      row.startDate !== null
        ? formatEventIntervalHu(row.startDate, row.endDate)
        : '—',
  },
  {
    key: 'status',
    header: 'Állapot',
    render: (row) => eventStatusLabel(row.status),
  },
  {
    key: 'videos',
    header: 'Videók száma',
    render: (row) => String(row.videoCount),
  },
  {
    key: 'updated',
    header: 'Utoljára módosította',
    render: (row) =>
      row.updatedByName !== null
        ? `${row.updatedByName} (${formatDateShort(row.updatedAt)})`
        : formatDateShort(row.updatedAt),
  },
]

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function EventFilters({
  search,
  onApply,
}: {
  search: AdminEventSearch
  onApply: (patch: Partial<Record<string, string | undefined>>) => void
}) {
  const [q, setQ] = useState(search.q ?? '')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onApply({ q: q.trim() === '' ? undefined : q.trim() })
      }}
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Keresés
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Cím, slug"
          className="h-10 w-52 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Állapot
        <select
          value={search.status ?? ''}
          onChange={(event) =>
            onApply({ status: event.target.value || undefined })
          }
          className="h-10 bg-(--nav-search-bg) px-2 outline-none"
        >
          <option value="">Mind</option>
          <option value="draft">Piszkozat</option>
          <option value="published">Publikált</option>
          <option value="archived">Archivált</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Kezdődátum ettől
        <input
          type="date"
          value={search.from ?? ''}
          onChange={(event) =>
            onApply({ from: event.target.value || undefined })
          }
          className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Kezdődátum eddig
        <input
          type="date"
          value={search.to ?? ''}
          onChange={(event) => onApply({ to: event.target.value || undefined })}
          className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
        />
      </label>
      <button
        type="submit"
        className="h-10 bg-(--orange) px-4 font-bold text-white"
      >
        Szűrés
      </button>
    </form>
  )
}
