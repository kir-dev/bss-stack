import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  VIDEO_PAGE_SIZES,
  VIDEO_SORTS,
  getVideoFilterOptions,
  getVideoListPage,
  parseVideoListSearch,
  videoSortLabel,
} from '#/server/pages/video-list.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { EmptyState, ThumbnailGridSkeleton } from '#/components/PageStates.tsx'
import Thumbnail from '#/components/Thumbnail.tsx'
import {
  AdminSearchSelect,
  FILTER_LABEL_CLASS,
} from '#/components/admin/SearchSelect.tsx'
import type { VideoListRawSearch } from '#/server/pages/video-list.ts'

const loadVideoList = createServerFn({ method: 'GET' })
  .validator((search: VideoListRawSearch) => search)
  .handler(async ({ data }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    return getVideoListPage(db, viewer, parseVideoListSearch(data))
  })

const loadFilterOptions = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDefaultDb()
    return getVideoFilterOptions(db)
  },
)

const VIDEO_GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'
const VIDEO_SORT_OPTIONS = VIDEO_SORTS.map((sort) => ({
  value: sort,
  label: videoSortLabel(sort),
}))
const VIDEO_PAGE_SIZE_OPTIONS = VIDEO_PAGE_SIZES.map((size) => ({
  value: String(size),
  label: String(size),
}))

export const Route = createFileRoute('/videos/')({
  validateSearch: (search: Record<string, unknown>): VideoListRawSearch => {
    const pickString = (key: string): string | undefined => {
      const value = search[key]
      return typeof value === 'string' && value !== '' ? value : undefined
    }
    const tagsValue = search['tags']
    const tags = Array.isArray(tagsValue)
      ? tagsValue.filter((tag): tag is string => typeof tag === 'string')
      : typeof tagsValue === 'string'
        ? [tagsValue]
        : undefined
    return {
      q: pickString('q'),
      sort: pickString('sort'),
      page: pickString('page'),
      perPage: pickString('perPage'),
      event: pickString('event'),
      from: pickString('from'),
      to: pickString('to'),
      staffMember: pickString('staffMember'),
      staffRole: pickString('staffRole'),
      ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
    }
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['video-list', deps.search],
      queryFn: () => loadVideoList({ data: deps.search }),
    }),
  component: VideoListPage,
  pendingComponent: VideoListSkeleton,
})

/** Placeholder for the video list: header plus a 16:9 card grid. */
function VideoListSkeleton() {
  return (
    <main className="site-width my-[4dvh]">
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">Videók</h1>
      <ThumbnailGridSkeleton
        count={10}
        className={VIDEO_GRID_CLASS}
        label="Videók betöltése…"
      />
    </main>
  )
}

function VideoListPage() {
  const navigate = useNavigate()
  const rawSearch = Route.useSearch()
  const pageData = useQuery({
    queryKey: ['video-list', rawSearch],
    queryFn: () => loadVideoList({ data: rawSearch }),
  })
  const optionsQuery = useQuery({
    queryKey: ['video-filter-options'],
    queryFn: loadFilterOptions,
    staleTime: 5 * 60_000,
  })
  const parsed = parseVideoListSearch(rawSearch)

  function update(patch: Partial<VideoListRawSearch>) {
    navigate({
      to: '/videos',
      search: (prev) => ({ ...prev, ...patch, page: undefined }),
    })
  }

  return (
    <main className="site-width my-[4dvh]">
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">Videók</h1>

      <VideoFilterBar
        parsed={parsed}
        raw={rawSearch}
        options={optionsQuery.data}
        onUpdate={update}
        onReset={() => navigate({ to: '/videos', search: {} })}
      />

      {pageData.isPending && (
        <ThumbnailGridSkeleton
          count={10}
          className={VIDEO_GRID_CLASS}
          label="Videók betöltése…"
        />
      )}
      {pageData.isError && (
        <p
          role="alert"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Hiba történt a videók betöltése közben. Próbáld újra később.
        </p>
      )}
      {pageData.isSuccess &&
        (pageData.data.items.length === 0 ? (
          <EmptyState
            title="Nincs találat"
            description="A megadott szűrőkkel egyetlen videó sem található. Módosítsd vagy töröld a szűrőket."
          />
        ) : (
          <>
            <div className={VIDEO_GRID_CLASS}>
              {pageData.data.items.map((item) => (
                <a
                  key={item.id}
                  href={`/videos/${item.slug}`}
                  className="group card-surface hover-lift block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)]"
                >
                  <Thumbnail src={item.thumbnailUrl} alt={item.title} />
                  <span className="block truncate px-2 py-1 text-(--bss-text-secondary) group-hover:text-(--orange)">
                    {item.title}
                  </span>
                </a>
              ))}
            </div>
            <Pagination
              page={pageData.data.page}
              totalPages={pageData.data.totalPages}
              onPage={(page) =>
                navigate({
                  to: '/videos',
                  search: (prev) => ({
                    ...prev,
                    page: page === 1 ? undefined : String(page),
                  }),
                })
              }
            />
          </>
        ))}
    </main>
  )
}

function VideoFilterBar({
  parsed,
  raw,
  options,
  onUpdate,
  onReset,
}: {
  parsed: ReturnType<typeof parseVideoListSearch>
  raw: VideoListRawSearch
  options?: Awaited<ReturnType<typeof getVideoFilterOptions>>
  onUpdate: (patch: Partial<VideoListRawSearch>) => void
  onReset: () => void
}) {
  const [q, setQ] = useState(parsed.q)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onUpdate({ q: q.trim() === '' ? undefined : q.trim() })
  }

  const hasActiveFilters =
    Object.keys(raw).filter((key) => key !== 'page' && key !== 'sort').length >
    0
  const eventOptions =
    options?.events.map((item) => ({
      value: item.slug,
      label: item.title,
    })) ?? []
  const staffMemberOptions =
    options?.staffMembers.map((item) => ({
      value: item.sub,
      label: item.fullName,
    })) ?? []
  const staffRoleOptions =
    options?.staffRoles.map((item) => ({
      value: item.id,
      label: item.name,
    })) ?? []

  return (
    <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Szabad szöveg
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Cím, leírás, vendég, stábtag"
          className="h-10 w-56 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none"
        />
      </label>
      <div className="w-56">
        <AdminSearchSelect
          label="Esemény"
          value={parsed.eventSlug}
          options={eventOptions}
          onChange={(value) => onUpdate({ event: value || undefined })}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          searchPlaceholder="Esemény keresése…"
          searchThreshold={0}
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <div className="w-56">
        <AdminSearchSelect
          label="Stábtag"
          value={parsed.staffMemberSub}
          options={staffMemberOptions}
          onChange={(value) => onUpdate({ staffMember: value || undefined })}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          searchPlaceholder="Stábtag keresése…"
          searchThreshold={0}
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <div className="w-48">
        <AdminSearchSelect
          label="Stábszerep"
          value={parsed.staffRoleId}
          options={staffRoleOptions}
          onChange={(value) => onUpdate({ staffRole: value || undefined })}
          placeholder="Mind"
          emptyOptionLabel="Mind"
          searchPlaceholder="Stábszerep keresése…"
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Készült ettől
        <input
          type="date"
          value={parsed.recordedFrom}
          onChange={(event) =>
            onUpdate({ from: event.target.value || undefined })
          }
          className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
        Készült eddig
        <input
          type="date"
          value={parsed.recordedTo}
          onChange={(event) =>
            onUpdate({ to: event.target.value || undefined })
          }
          className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2"
        />
      </label>
      <TagPicker
        selected={parsed.tagNames}
        allTags={options?.tags.map((tag) => tag.name) ?? []}
        onChange={(tags) => onUpdate({ tags })}
      />
      <div className="w-48">
        <AdminSearchSelect
          label="Rendezés"
          value={parsed.sort}
          options={VIDEO_SORT_OPTIONS}
          onChange={(value) => onUpdate({ sort: value })}
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <div className="w-28">
        <AdminSearchSelect
          label="Oldalméret"
          value={String(parsed.perPage)}
          options={VIDEO_PAGE_SIZE_OPTIONS}
          onChange={(value) => onUpdate({ perPage: value })}
          labelClassName={FILTER_LABEL_CLASS}
        />
      </div>
      <button
        type="submit"
        className="solid-btn h-10 bg-(--orange) px-4 font-bold text-white"
      >
        Szűrés
      </button>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="ctrl-btn h-10 px-3 font-bold text-(--orange)"
        >
          Szűrők törlése
        </button>
      )}
      {parsed.tagNames.length > 0 && (
        <div
          className="flex basis-full flex-wrap gap-1"
          aria-label="Kiválasztott címkék"
        >
          {parsed.tagNames.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                onUpdate({
                  tags: parsed.tagNames.filter(
                    (selectedTag) => selectedTag !== tag,
                  ),
                })
              }
              aria-label={`${tag} címke eltávolítása`}
              className="ctrl-btn max-w-full truncate px-2 py-0.5 text-xs text-(--bss-text-secondary) hover:text-(--orange)"
            >
              {tag} ×
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

function TagPicker({
  selected,
  allTags,
  onChange,
}: {
  selected: string[]
  allTags: string[]
  onChange: (tags: string[]) => void
}) {
  const availableTags = allTags
    .filter((tag) => !selected.includes(tag))
    .map((tag) => ({ value: tag, label: tag }))

  return (
    <div className="w-56">
      <AdminSearchSelect
        label="Címkék"
        value=""
        options={availableTags}
        onChange={(tag) => {
          if (tag !== '') {
            onChange([...selected, tag])
          }
        }}
        placeholder={
          selected.length > 0 ? `${selected.length} kiválasztva (ÉS)` : 'Mind'
        }
        searchPlaceholder="Címke keresése…"
        labelClassName={FILTER_LABEL_CLASS}
      />
    </div>
  )
}

function Pagination({
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
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
  return (
    <nav aria-label="Videólapozás" className="mt-8 flex justify-center gap-1">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        aria-label="Előző oldal"
        className="ctrl-btn h-10 rounded px-3"
      >
        ‹
      </button>
      {pages.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPage(value)}
          aria-current={value === page ? 'page' : undefined}
          className={`ctrl-btn h-10 w-10 rounded ${value === page ? 'font-bold text-(--orange)' : 'text-(--bss-text-secondary)'}`}
        >
          {value}
        </button>
      ))}
      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Következő oldal"
        className="ctrl-btn h-10 rounded px-3"
      >
        ›
      </button>
    </nav>
  )
}
