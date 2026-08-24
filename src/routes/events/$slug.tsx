import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestUrl } from '@tanstack/react-start/server'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getEventDetail } from '#/server/pages/event-list.ts'
import { resolvePublicSlug } from '#/server/pages/slug-route.ts'
import {
  formatCalendarDateHu,
  formatEventIntervalHu,
} from '#/lib/format-date.ts'
import Thumbnail from '#/components/Thumbnail.tsx'

const loadEventDetail = createServerFn({ method: 'GET' })
  .validator((input: { slug: string; page?: number }) => input)
  .handler(async ({ data }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    const detail = await getEventDetail(db, viewer, data.slug, {
      page: data.page,
    })
    if (detail !== null) {
      return {
        detail,
        redirectSlug: null as string | null,
        canonical: `${getRequestUrl().origin}/events/${detail.slug}`,
      }
    }
    const resolution = await resolvePublicSlug(db, {
      entityType: 'event',
      slug: data.slug,
      viewer,
    })
    return {
      detail: null,
      redirectSlug:
        resolution !== null && resolution.kind === 'redirect'
          ? resolution.canonicalSlug
          : null,
      canonical: '',
    }
  })

type EventDetailSearch = { page?: string }

export const Route = createFileRoute('/events/$slug')({
  validateSearch: (search: Record<string, unknown>): EventDetailSearch => ({
    page:
      typeof search['page'] === 'string' && search['page'] !== ''
        ? search['page']
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const result = await loadEventDetail({
      data: {
        slug: params.slug,
        page:
          deps.search.page === undefined ? undefined : Number(deps.search.page),
      },
    })
    if (result.redirectSlug !== null) {
      throw redirect({
        to: '/events/$slug',
        params: { slug: result.redirectSlug },
        replace: true,
      })
    }
    if (result.detail === null) {
      throw notFound()
    }
    return { detail: result.detail, canonical: result.canonical }
  },
  component: EventDetailPageComponent,
})

function EventDetailPageComponent() {
  const { detail, canonical } = Route.useLoaderData()
  const description = detail.description?.slice(0, 300) ?? detail.title

  return (
    <main className="mx-auto my-[4dvh] w-[90dvw]">
      <title>{detail.title} | BSS</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={detail.title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      {detail.thumbnailUrl !== null && (
        <meta property="og:image" content={detail.thumbnailUrl} />
      )}

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="w-full md:w-[420px] md:shrink-0">
          <Thumbnail
            src={detail.thumbnailUrl}
            alt={detail.title}
            loading="eager"
          />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-(--bss-text)">
            {detail.title}
          </h1>
          {detail.startDate !== null && (
            <p className="mt-2 text-(--bss-text-secondary)">
              {formatEventIntervalHu(detail.startDate, detail.endDate)}
            </p>
          )}
          {detail.description !== null && (
            <p className="mt-4 whitespace-pre-line">{detail.description}</p>
          )}
        </div>
      </div>

      {detail.staffMembers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-(--bss-text)">
            Közreműködtek
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {detail.staffMembers.map((member) => (
              <li key={member.username}>
                <Link
                  to="/members/$slug"
                  params={{ slug: member.username }}
                  className="underline hover:text-(--orange)"
                >
                  {member.fullName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-(--bss-text)">
          Videók ({detail.videos.total})
        </h2>
        {detail.videos.items.length === 0 ? (
          <p className="mt-4 text-(--bss-text-secondary)">
            Ehhez az eseményhez még nincs megtekinthető videó.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {detail.videos.items.map((video) => (
                <Link
                  key={video.id}
                  to="/videos/$slug"
                  params={{ slug: video.slug }}
                  className="group card-surface hover-lift block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)]"
                >
                  <Thumbnail src={video.thumbnailUrl} alt={video.title} />
                  <span className="block truncate px-2 py-1 text-(--bss-text-secondary) group-hover:text-(--orange)">
                    {video.title}
                  </span>
                  {video.recordedAt !== null && (
                    <span className="block px-2 pb-1 text-xs text-(--bss-text-secondary)">
                      {formatCalendarDateHu(video.recordedAt)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            <EventVideoPagination
              slug={detail.slug}
              total={detail.videos.total}
            />
          </>
        )}
      </section>
    </main>
  )
}

function EventVideoPagination({
  slug,
  total,
}: {
  slug: string
  total: number
}) {
  const totalPages = Math.ceil(total / 50)
  if (totalPages <= 1) {
    return null
  }
  return (
    <nav
      aria-label="Eseményvideók lapozása"
      className="mt-6 flex justify-center gap-2"
    >
      {Array.from({ length: totalPages }, (_, index) => index + 1).map(
        (value) => (
          <Link
            key={value}
            to="/events/$slug"
            params={{ slug }}
            search={{ page: value === 1 ? undefined : String(value) }}
            className="h-10 w-10 text-center leading-10 text-(--bss-text-secondary)"
          >
            {value}
          </Link>
        ),
      )}
    </nav>
  )
}
