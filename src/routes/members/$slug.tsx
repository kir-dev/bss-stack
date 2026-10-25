import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMemberActivity, getMemberProfile } from '#/server/pages/members.ts'
import { groupActivity } from '#/lib/activity.ts'
import type { ActivityRow } from '#/lib/activity.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { formatCalendarDateHu } from '#/lib/format-date.ts'
import { formatAcademicSemesterHu } from '#/lib/academic-semester.ts'
import { memberProfilePath, memberSlug } from '#/lib/member-slug.ts'
import { SITE_NAME, pageHead } from '#/lib/seo.ts'

const ACTIVITY_PAGE_SIZE = 50

const loadMemberProfile = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const db = await getDefaultDb()
    return getMemberProfile(db, slug)
  })

const loadMemberActivity = createServerFn({ method: 'GET' })
  .validator((input: { sub: string; limit: number; offset: number }) => input)
  .handler(async ({ data }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    return getMemberActivity(db, viewer, data.sub, {
      limit: data.limit,
      offset: data.offset,
    })
  })

export const Route = createFileRoute('/members/$slug')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: 'year' | 'role'; offset?: number } => {
    const view = search['view']
    const offsetRaw = search['offset']
    const offset = Number(offsetRaw)
    const result: { view?: 'year' | 'role'; offset?: number } = {}
    if (view === 'role') {
      result.view = 'role'
    } else if (view === 'year') {
      result.view = 'year'
    }
    if (
      typeof offsetRaw !== 'undefined' &&
      Number.isInteger(offset) &&
      offset > 0
    ) {
      result.offset = offset
    }
    return result
  },
  loader: async ({ params, context }) => {
    const [profile, viewer] = await Promise.all([
      loadMemberProfile({ data: params.slug }),
      context.queryClient.ensureQueryData({
        queryKey: ['viewer'],
        queryFn: fetchViewerState,
        staleTime: 60_000,
      }),
    ])
    if (profile === null) {
      throw notFound()
    }
    await context.queryClient.prefetchQuery({
      queryKey: ['member-activity', profile.sub, 0, viewer.level],
      queryFn: () =>
        loadMemberActivity({
          data: { sub: profile.sub, limit: ACTIVITY_PAGE_SIZE, offset: 0 },
        }),
    })
    return { profile }
  },
  head: ({ loaderData }) =>
    loaderData === undefined
      ? {}
      : pageHead({
          title: loaderData.profile.fullName,
          description:
            loaderData.profile.introduction ??
            `${loaderData.profile.fullName} profilja a ${SITE_NAME}ban (${loaderData.profile.statusLabel}).`,
          path: memberProfilePath(loaderData.profile),
          image: loaderData.profile.avatarUrl,
          type: 'profile',
          twitterCard: 'summary',
        }),
  component: MemberProfilePage,
})

function MemberProfilePage() {
  const { profile } = Route.useLoaderData()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const view = search.view ?? 'year'
  const [extraRows, setExtraRows] = useState<Array<ActivityRow>>([])

  const viewerQuery = useQuery({
    queryKey: ['viewer'],
    queryFn: fetchViewerState,
    staleTime: 60_000,
  })
  const level = viewerQuery.data?.level ?? 'anonymous'

  const firstPageQuery = useQuery({
    queryKey: ['member-activity', profile.sub, 0, level],
    queryFn: () =>
      loadMemberActivity({
        data: { sub: profile.sub, limit: ACTIVITY_PAGE_SIZE, offset: 0 },
      }),
  })

  if (firstPageQuery.isPending) {
    return (
      <main className="site-width py-[6dvh]">
        <p role="status" className="text-center text-(--bss-text-secondary)">
          Betöltés…
        </p>
      </main>
    )
  }
  if (firstPageQuery.isError) {
    throw notFound()
  }

  const firstPage = firstPageQuery.data
  const rows = [...firstPage.items, ...extraRows]
  const total = firstPage.total
  const grouped = groupActivity(rows, view)

  function setView(nextView: 'year' | 'role') {
    void navigate({
      to: '/members/$slug',
      params: { slug: memberSlug(profile) },
      search: (prev) => ({
        ...prev,
        view: nextView === 'year' ? undefined : nextView,
      }),
    })
  }

  async function loadMore() {
    const nextOffset = rows.length
    const result = await loadMemberActivity({
      data: { sub: profile.sub, limit: ACTIVITY_PAGE_SIZE, offset: nextOffset },
    })
    setExtraRows((prev) => [...prev, ...result.items])
  }

  return (
    <main className="site-width my-[4dvh]">
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <img
          className="h-[440px] w-auto max-w-[300px] self-start object-contain object-top drop-shadow-[0_5px_10px_rgba(255,145,0,0.45)]"
          src={profile.avatarUrl ?? '/default-avatar.png'}
          alt={profile.fullName}
        />
        <div className="flex flex-col gap-[2dvh] text-xl">
          <h1 className="text-4xl font-bold text-(--bss-text)">
            {profile.fullName}
          </h1>
          {profile.nickname !== null && (
            <p>
              <span className="font-bold text-(--members-data-category)">
                Becenév:{' '}
              </span>
              <span className="font-bold text-(--members-data)">
                {profile.nickname}
              </span>
            </p>
          )}
          <p>
            <span className="font-bold text-(--members-data-category)">
              Státusz:{' '}
            </span>
            <span className="text-(--members-data)">
              {profile.statusLabel}
              {profile.leadershipRole !== null
                ? `, ${profile.leadershipRole}`
                : ''}
              {profile.archived ? ', Archivált' : ''}
            </span>
          </p>
          {profile.joinedSemester !== null && (
            <p>
              <span className="font-bold text-(--members-data-category)">
                Csatlakozás féléve:{' '}
              </span>
              <span className="text-(--members-data)">
                {formatAcademicSemesterHu(profile.joinedSemester)}
              </span>
            </p>
          )}
          {profile.introduction !== null && (
            <div>
              <span className="font-bold text-(--members-data-category)">
                Bemutatkozás
              </span>
              <p className="whitespace-pre-line text-(--members-data)">
                {profile.introduction}
              </p>
            </div>
          )}
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between border-b border-b-(--members-data) py-5">
          <h2 className="text-2xl font-bold text-(--members-data)">
            Tevékenység
          </h2>
          <div
            className="flex gap-4"
            role="tablist"
            aria-label="Tevékenység nézet"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'year'}
              onClick={() => setView('year')}
              className={`nav-link font-semibold ${view === 'year' ? 'text-(--orange)' : 'text-(--bss-text-secondary)'}`}
            >
              Évek szerint
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'role'}
              onClick={() => setView('role')}
              className={`nav-link font-semibold ${view === 'role' ? 'text-(--orange)' : 'text-(--bss-text-secondary)'}`}
            >
              Szerep szerint
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-(--bss-text-secondary)">
            Ehhez a taghoz jelenleg nincs megtekinthető tevékenység.
          </p>
        ) : view === 'year' ? (
          <div>
            {grouped.yearGroups.map((yearGroup) => (
              <div
                key={yearGroup.year}
                className="border-b border-b-(--members-data)"
              >
                <h3 className="px-4 py-3 text-lg font-bold text-(--members-data)">
                  {yearGroup.year === 0 ? 'Dátum nélkül' : yearGroup.year}
                </h3>
                {yearGroup.groups.map((group) => (
                  <div key={group.roleName} className="pl-8 pr-4 pb-3">
                    <p className="text-sm font-semibold text-(--orange)">
                      {group.roleName}
                    </p>
                    <ActivityList rows={group.videos} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div>
            {grouped.roleGroups.map((group) => (
              <div
                key={group.roleName}
                className="border-b border-b-(--members-data)"
              >
                <h3 className="px-4 py-3 text-lg font-bold text-(--members-data)">
                  {group.roleName}
                </h3>
                <div className="pl-8 pr-4 pb-3">
                  <ActivityList rows={group.videos} />
                </div>
              </div>
            ))}
          </div>
        )}

        {rows.length < total && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="solid-btn mx-auto mt-6 block bg-(--orange) px-6 py-2 font-bold text-white"
          >
            Továbbiak betöltése
          </button>
        )}
      </section>
    </main>
  )
}

function ActivityList({ rows }: { rows: Array<ActivityRow> }) {
  const linkClassName =
    'min-w-0 truncate font-semibold text-(--bss-text-secondary) underline hover:text-(--orange)'
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li
          key={`${row.kind}-${row.id}`}
          className="flex items-baseline justify-between gap-4"
        >
          {row.kind === 'event' ? (
            <Link
              to="/events/$slug"
              params={{ slug: row.slug }}
              className={linkClassName}
            >
              {row.title}
            </Link>
          ) : (
            <Link
              to="/videos/$slug"
              params={{ slug: row.slug }}
              className={linkClassName}
            >
              {row.title}
            </Link>
          )}
          <span className="whitespace-nowrap text-sm font-semibold text-(--members-data)">
            {row.recordedAt !== null
              ? formatCalendarDateHu(row.recordedAt)
              : 'Dátum nélkül'}
          </span>
        </li>
      ))}
    </ul>
  )
}
