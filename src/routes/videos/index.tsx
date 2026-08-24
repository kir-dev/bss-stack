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
import { EmptyState } from '#/components/PageStates.tsx'
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
})

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
    <main className="mx-auto w-[90dvw] my-[4dvh]">
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">Videók</h1>

      <VideoFilterBar
        parsed={parsed}
        raw={rawSearch}
        options={optionsQuery.data}
        onUpdate={update}
        onReset={() => navigate({ to: '/videos', search: {} })}
      />

      {pageData.isPending && (
        <p
          role="status"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Betöltés…
        </p>
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {pageData.data.items.map((item) => (
                <a
                  key={item.id}
                  href={`/videos/${item.slug}`}
                  className="group hover-lift block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)]"
                >
                  <img
                    src={item.thumbnailUrl ?? '/video-thumbnail.png'}
                    alt={item.title}
                    className="block h-auto w-full object-cover"
                  />
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
      <SelectField
        label="Esemény"
        value={parsed.eventSlug}
        onChange={(event) => onUpdate({ event: event || undefined })}
      >
        <option value="">Mind</option>
        {options?.events.map((item) => (
          <option key={item.slug} value={item.slug}>
            {item.title}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Stábtag"
        value={parsed.staffMemberSub}
        onChange={(event) => onUpdate({ staffMember: event || undefined })}
      >
        <option value="">Mind</option>
        {options?.staffMembers.map((item) => (
          <option key={item.sub} value={item.sub}>
            {item.fullName}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Stábszerep"
        value={parsed.staffRoleId}
        onChange={(event) => onUpdate({ staffRole: event || undefined })}
      >
        <option value="">Mind</option>
        {options?.staffRoles.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
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
      <SelectField
        label="Rendezés"
        value={parsed.sort}
        onChange={(event) => onUpdate({ sort: event })}
      >
        {VIDEO_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {videoSortLabel(sort)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Oldalméret"
        value={String(parsed.perPage)}
        onChange={(event) => onUpdate({ perPage: event })}
      >
        {VIDEO_PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </SelectField>
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
    </form>
  )
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 bg-(--nav-search-bg) px-2 outline-none"
      >
        {children}
      </select>
    </label>
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
  const [open, setOpen] = useState(false)
  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag)
        ? selected.filter((item) => item !== tag)
        : [...selected, tag],
    )
  }
  return (
    <div className="relative flex flex-col gap-1 text-xs text-(--bss-text-secondary)">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="ctrl-btn h-10 bg-(--nav-search-bg) px-2 text-left"
      >
        Címkék {selected.length > 0 && `(ÉS: ${selected.length})`}
      </button>
      {open && (
        <div className="absolute top-full z-20 max-h-64 w-64 overflow-y-auto border border-(--nav-border-b) bg-(--bg) p-2 shadow-lg">
          {allTags.length === 0 && <p>Nincsenek címkék.</p>}
          {allTags.map((tag) => (
            <label
              key={tag}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-(--nav-search-bg)"
            >
              <input
                type="checkbox"
                checked={selected.includes(tag)}
                onChange={() => toggle(tag)}
              />
              <span>{tag}</span>
            </label>
          ))}
          <p className="mt-2 text-[11px]">Több címke ÉS kapcsolatban szűr.</p>
        </div>
      )}
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
