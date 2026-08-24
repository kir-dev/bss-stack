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
import { getVideoDetail } from '#/server/pages/video-detail.ts'
import { resolvePublicSlug } from '#/server/pages/slug-route.ts'
import VideoDetailPlayer from '#/components/VideoDetailPlayer.tsx'
import { formatCalendarDateHu, formatDateHu } from '#/lib/format-date.ts'
import Thumbnail from '#/components/Thumbnail.tsx'

const loadVideoDetail = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    const detail = await getVideoDetail(db, viewer, slug)
    if (detail !== null) {
      const origin = getRequestUrl().origin
      return {
        detail,
        redirectSlug: null as string | null,
        canonical: `${origin}/videos/${detail.slug}`,
      }
    }
    // No public video at the current slug: try an old slug redirect.
    const resolution = await resolvePublicSlug(db, {
      entityType: 'video',
      slug,
      viewer,
    })
    const redirectSlug =
      resolution !== null && resolution.kind === 'redirect'
        ? resolution.canonicalSlug
        : null
    return { detail: null, redirectSlug, canonical: '' }
  })

export const Route = createFileRoute('/videos/$slug')({
  loader: async ({ params }) => {
    const result = await loadVideoDetail({ data: params.slug })
    if (result.redirectSlug !== null) {
      throw redirect({
        to: '/videos/$slug',
        params: { slug: result.redirectSlug },
        replace: true,
      })
    }
    if (result.detail === null) {
      throw notFound()
    }
    return {
      detail: result.detail,
      canonical: result.canonical,
    }
  },
  component: VideoDetailPage,
})

function VideoDetailPage() {
  const { detail, canonical } = Route.useLoaderData()
  const description = detail.description?.slice(0, 300) ?? detail.title
  return (
    <main className="flex-1">
      <title>{`${detail.title} | BSS`}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={detail.title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="video.other" />
      {detail.thumbnailUrl !== null && (
        <meta property="og:image" content={detail.thumbnailUrl} />
      )}

      <div className="flex w-full justify-center bg-black">
        {detail.videoUrl !== null ? (
          <div className="w-full max-w-6xl">
            <VideoDetailPlayer
              videoId={detail.id}
              videoUrl={detail.videoUrl}
              posterUrl={detail.thumbnailUrl}
              title={detail.title}
            />
          </div>
        ) : (
          <p className="p-10 text-white">A videó most nem érhető el.</p>
        )}
      </div>

      <div className="mx-auto my-6 w-full max-w-5xl px-4 sm:my-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl leading-tight font-bold text-(--videos-video-title) sm:text-4xl lg:text-5xl">
          {detail.title}
        </h1>

        <dl className="my-5 grid gap-2 text-sm text-(--bss-text-secondary) sm:grid-cols-2 sm:text-base">
          {detail.recordedAt !== null && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-(--videos-video-title)">
                Készült:
              </dt>
              <dd>{formatCalendarDateHu(detail.recordedAt)}</dd>
            </div>
          )}
          {detail.publishedAt !== null && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-(--videos-video-title)">
                Feltöltve:
              </dt>
              <dd>{formatDateHu(detail.publishedAt)}</dd>
            </div>
          )}
        </dl>

        {detail.event !== null && (
          <p className="my-4 leading-relaxed">
            <span className="font-semibold text-(--videos-video-title)">
              Esemény:{' '}
            </span>
            <Link
              to="/events/$slug"
              params={{ slug: detail.event.slug }}
              className="underline hover:text-(--orange)"
            >
              {detail.event.title}
            </Link>
          </p>
        )}

        {detail.description !== null && (
          <p className="whitespace-pre-line leading-7">{detail.description}</p>
        )}

        {detail.guests !== null && (
          <section className="mt-5">
            <h2 className="font-semibold text-(--videos-video-title)">
              Vendégek
            </h2>
            <p className="whitespace-pre-line leading-7">{detail.guests}</p>
          </section>
        )}

        {detail.songs !== null && (
          <section className="mt-5">
            <h2 className="font-semibold text-(--videos-video-title)">
              Felhasznált zenék
            </h2>
            <p className="whitespace-pre-line leading-7">{detail.songs}</p>
          </section>
        )}

        {detail.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {detail.tags.map((tag) => (
              <li key={tag.name}>
                <Link
                  to="/videos"
                  search={{ tags: [tag.name] }}
                  className="rounded-4xl bg-(--videos-tag) p-2 text-xs font-bold text-(--videos-tag-text)"
                >
                  {tag.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {detail.staff.length > 0 && (
          <section className="mt-6 space-y-2">
            {detail.staff.map((role) => (
              <div key={role.roleId}>
                <span className="font-semibold text-(--videos-video-title)">
                  {role.roleName}:{' '}
                </span>
                {role.members.map((member, index) => (
                  <span key={member.sub}>
                    {index > 0 && ', '}
                    <Link
                      to="/members/$slug"
                      params={{ slug: member.username }}
                      className="underline hover:text-(--orange)"
                    >
                      {member.fullName}
                    </Link>
                  </span>
                ))}
              </div>
            ))}
          </section>
        )}

        {detail.relatedVideos.length > 0 && (
          <section className="mt-10">
            <h2 className="text-3xl font-bold text-(--videos-video-title) sm:text-4xl">
              További videók
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {detail.relatedVideos.map((related) => (
                <Link
                  key={related.id}
                  to="/videos/$slug"
                  params={{ slug: related.slug }}
                  className="group card-surface hover-lift block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)]"
                >
                  <Thumbnail src={related.thumbnailUrl} alt={related.title} />
                  <span className="block truncate px-2 py-1 text-(--bss-text-secondary) group-hover:text-(--orange)">
                    {related.title}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
