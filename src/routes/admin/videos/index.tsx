import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  getAdminVideoFilterOptions,
  getAdminVideoList,
  parseAdminVideoFilters,
} from '#/server/admin/video-list.ts'
import type { AdminVideoListItem } from '#/server/admin/video-list.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import {
  parsePaginationNumber,
  parseSearchPage,
} from '#/server/shared/pagination.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import { ResponsiveTable } from '#/components/admin/ResponsiveTable.tsx'
import {
  AdminSearchSelect,
  FILTER_LABEL_CLASS,
} from '#/components/admin/SearchSelect.tsx'
import type { AdminColumn } from '#/components/admin/ResponsiveTable.tsx'
import type { SearchSelectOption } from '#/components/admin/SearchSelect.tsx'
import {
  VIDEO_STATUS_OPTIONS,
  VISIBILITY_OPTIONS,
  videoStatusLabel,
  visibilityLabel,
} from '#/lib/admin-labels.ts'
import {
  formatAdminDateTimeHu,
  formatCalendarDateHu,
} from '#/lib/format-date.ts'

const loadAdminVideoList = createServerFn({ method: 'GET' })
  .validator(
    (input: Record<string, string | number | undefined> | undefined) =>
      input ?? {},
  )
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getAdminVideoList(db, {
      page: parsePaginationNumber(data['page'], 1),
      perPage: parsePaginationNumber(data['perPage'], ADMIN_DEFAULT_PAGE_SIZE),
      filters: parseAdminVideoFilters(data),
    })
  })

const loadFilterOptions = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDefaultDb()
    return getAdminVideoFilterOptions(db)
  },
)

// Type alias (not an interface) so it can be passed to the server function's
// `Record` parameter with an implicit index signature.
type AdminVideoSearch = {
  q?: string
  status?: string
  visibility?: string
  event?: string
  tag?: string
  page?: number
}

export const Route = createFileRoute('/admin/videos/')({
  validateSearch: (search: Record<string, unknown>): AdminVideoSearch => ({
    q: pickString(search, 'q'),
    status: pickString(search, 'status'),
    visibility: pickString(search, 'visibility'),
    event: pickString(search, 'event'),
    tag: pickString(search, 'tag'),
    page: parseSearchPage(search['page']),
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-video-list', deps.search],
      queryFn: () => loadAdminVideoList({ data: deps.search }),
    }),
  component: AdminVideoListPage,
})

function pickString(
  search: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = search[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function AdminVideoListPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const listQuery = useQuery({
    queryKey: ['admin-video-list', search],
    queryFn: () => loadAdminVideoList({ data: search }),
  })
  const optionsQuery = useQuery({
    queryKey: ['admin-video-filter-options'],
    queryFn: loadFilterOptions,
    staleTime: 60_000,
  })

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-(--bss-text)">Videók</h1>
        <Link
          to="/admin/videos/new"
          className="rounded bg-(--orange) px-4 py-2 text-sm font-bold text-white"
        >
          Új videó
        </Link>
      </div>

      <VideoFilters
        search={search}
        options={optionsQuery.data}
        onApply={(patch) =>
          navigate({
            search: (prev) => ({ ...prev, ...patch, page: undefined }),
          })
        }
      />

      {listQuery.isPending && <LoadingState />}
      {listQuery.isError && (
        <ErrorState label="Hiba történt a videók betöltése közben. Próbáld újra később." />
      )}
      {listQuery.isSuccess &&
        (listQuery.data.items.length === 0 ? (
          <div className="py-[6dvh] text-center text-(--bss-text-secondary)">
            {hasActiveFilters(search)
              ? 'Nincs találat a megadott szűrőkkel.'
              : 'Még nincs videó. Készíts piszkozatot az Új videó gombbal.'}
          </div>
        ) : (
          <>
            <ResponsiveTable
              columns={videoColumns}
              rows={listQuery.data.items}
              emptyTitle="Nincs találat."
              emptyDescription="Módosítsd vagy töröld a szűrőket."
            />
            <AdminPagination
              page={listQuery.data.page}
              totalPages={Math.max(listQuery.data.totalPages, 1)}
              onPage={(page) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    page: page === 1 ? undefined : page,
                  }),
                })
              }
            />
          </>
        ))}
    </main>
  )
}

function hasActiveFilters(search: AdminVideoSearch): boolean {
  return (
    search.q !== undefined ||
    search.status !== undefined ||
    search.visibility !== undefined ||
    search.event !== undefined ||
    search.tag !== undefined
  )
}

const videoColumns: Array<AdminColumn<AdminVideoListItem>> = [
  {
    key: 'title',
    header: 'Cím',
    primary: true,
    render: (row) => (
      <span className="flex items-center gap-2">
        <img
          src={row.thumbnailUrl ?? '/video-thumbnail.png'}
          alt=""
          className="h-8 w-14 rounded object-cover"
        />
        <Link
          to="/admin/videos/$id"
          params={{ id: row.id }}
          className="font-bold hover:text-(--orange)"
        >
          {row.title}
        </Link>
        {/* Public page of a published video; nothing to open for a draft. */}
        {row.status === 'published' && (
          <Link
            to="/videos/$slug"
            params={{ slug: row.slug }}
            target="_blank"
            rel="noreferrer"
            title="Megnyitás az oldalon"
            aria-label={`„${row.title}" megnyitása az oldalon`}
            className="shrink-0 text-(--bss-text-secondary) hover:text-(--orange)"
          >
            ↗
          </Link>
        )}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Állapot',
    render: (row) => videoStatusLabel(row.status),
  },
  {
    key: 'visibility',
    header: 'Láthatóság',
    render: (row) => visibilityLabel(row.visibility),
  },
  {
    key: 'event',
    header: 'Esemény',
    render: (row) => row.eventTitle ?? '—',
  },
  {
    key: 'recordedAt',
    header: 'Készült',
    render: (row) =>
      row.recordedAt !== null ? formatCalendarDateHu(row.recordedAt) : '—',
  },
  {
    key: 'publishedAt',
    header: 'Feltöltve',
    render: (row) =>
      row.publishedAt !== null ? formatAdminDateTimeHu(row.publishedAt) : '—',
  },
  {
    key: 'views',
    header: 'Nézettség',
    render: (row) => String(row.viewCount),
  },
  {
    key: 'updated',
    header: 'Utoljára módosította',
    render: (row) =>
      row.updatedByName !== null
        ? `${row.updatedByName} (${formatAdminDateTimeHu(row.updatedAt)})`
        : formatAdminDateTimeHu(row.updatedAt),
  },
]

function VideoFilters({
  search,
  options,
  onApply,
}: {
  search: AdminVideoSearch
  options?: Awaited<ReturnType<typeof getAdminVideoFilterOptions>>
  onApply: (patch: Partial<Record<string, string | undefined>>) => void
}) {
  const [q, setQ] = useState(search.q ?? '')
  const eventOptions: Array<SearchSelectOption> = (options?.events ?? []).map(
    (event) => ({ value: event.id, label: event.title }),
  )
  const tagOptions: Array<SearchSelectOption> = (options?.tags ?? []).map(
    (tag) => ({ value: tag.id, label: tag.name }),
  )

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
          placeholder="Cím, slug, leírás"
          className="h-10 w-52 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none"
        />
      </label>
      <div className="w-40">
        <AdminSearchSelect
          label="Állapot"
          value={search.status ?? ''}
          onChange={(value) => onApply({ status: value || undefined })}
          options={VIDEO_STATUS_OPTIONS}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <div className="w-40">
        <AdminSearchSelect
          label="Láthatóság"
          value={search.visibility ?? ''}
          onChange={(value) => onApply({ visibility: value || undefined })}
          options={VISIBILITY_OPTIONS}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <div className="w-56">
        <AdminSearchSelect
          label="Esemény"
          value={search.event ?? ''}
          onChange={(value) => onApply({ event: value || undefined })}
          options={eventOptions}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          searchPlaceholder="Esemény keresése…"
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <div className="w-56">
        <AdminSearchSelect
          label="Címke"
          value={search.tag ?? ''}
          onChange={(value) => onApply({ tag: value || undefined })}
          options={tagOptions}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          searchPlaceholder="Címke keresése…"
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <button
        type="submit"
        className="h-10 bg-(--orange) px-4 font-bold text-white"
      >
        Szűrés
      </button>
    </form>
  )
}

export function AdminPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (page: number) => void
}) {
  if (totalPages <= 1) {
    return null
  }
  return (
    <nav
      aria-label="Oldalazás"
      className="mt-4 flex items-center gap-2 text-sm"
    >
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="rounded border border-(--nav-border-b) px-3 py-1 disabled:opacity-30"
      >
        ‹ Előző
      </button>
      <span className="text-(--bss-text-secondary)">
        {page}. / {totalPages}. oldal
      </span>
      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded border border-(--nav-border-b) px-3 py-1 disabled:opacity-30"
      >
        Következő ›
      </button>
    </nav>
  )
}
