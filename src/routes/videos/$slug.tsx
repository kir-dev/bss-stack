import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { getRequest } from '@tanstack/react-start/server'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { stringInput } from '#/server/shared/server-fn-input.ts'
import { getVideoDetail } from '#/server/pages/video-detail.ts'
import { resolvePublicSlug } from '#/server/pages/slug-route.ts'
import VideoDetailPlayer from '#/components/VideoDetailPlayer.tsx'
import YoutubePlayer from '#/components/YoutubePlayer.tsx'
import { formatCalendarDateHu, formatDateHu } from '#/lib/format-date.ts'
import Thumbnail from '#/components/Thumbnail.tsx'
import { parseVideoStartTime } from '#/lib/video-time.ts'
import { memberSlug } from '#/lib/member-slug.ts'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { pageHead } from '#/lib/seo.ts'
import type { PageSeoImage } from '#/lib/seo.ts'
import { probePngSize } from '#/server/media/image-size.ts'
import type { VideoDetail } from '#/server/pages/video-detail.ts'
import { YOUTUBE_KEYFRAME_SIZE } from '#/lib/video-media.ts'

// Matches the "További videók" grid inside the max-w-5xl content column.
const RELATED_THUMBNAIL_SIZES =
  '(min-width: 1024px) 307px, (min-width: 420px) calc((100vw - 4rem) / 2), calc(100vw - 2rem)'

const loadVideoDetail = createServerFn({ method: 'GET' })
  .validator((slug: string) => stringInput(slug))
  .handler(async ({ data: slug }) => {
    const { viewer } = await resolveViewerStateFromRequest(getRequest())
    const db = await getDefaultDb()
    const detail = await getVideoDetail(db, viewer, slug)
    if (detail !== null) {
      return {
        detail,
        shareImage: await shareImage(detail),
        redirectSlug: null as string | null,
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
    return { detail: null, shareImage: null, redirectSlug }
  })

/**
 * The keyframe for link previews, with its size so Facebook and Messenger can
 * render it right away. `null` falls back to the site's default image: the
 * list thumbnail (160×90) is below the minimum size of link previews
 * (Facebook: 200×200), so they'd show no image at all.
 */
async function shareImage(detail: VideoDetail): Promise<PageSeoImage | null> {
  if (detail.keyframeUrl === null) {
    return null
  }
  if (detail.embedUrl !== null) {
    return { url: detail.keyframeUrl, ...YOUTUBE_KEYFRAME_SIZE }
  }
  const size = await probePngSize(detail.keyframeUrl)
  if (size === null) {
    return null
  }
  return { url: detail.keyframeUrl, ...size }
}

export const Route = createFileRoute('/videos/$slug')({
  validateSearch: (search: Record<string, unknown>): { t?: number } => ({
    t: parseVideoStartTime(search['t']),
  }),
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
    return { detail: result.detail, shareImage: result.shareImage }
  },
  head: ({ loaderData }) =>
    loaderData === undefined
      ? {}
      : pageHead({
          title: loaderData.detail.title,
          description: loaderData.detail.description,
          path: `/videos/${loaderData.detail.slug}`,
          image: loaderData.shareImage,
          jsonLd: videoJsonLd(loaderData.detail),
        }),
  component: VideoDetailPage,
})

function videoJsonLd(detail: VideoDetail): Array<Record<string, unknown>> {
  const thumbnailUrls = [detail.keyframeUrl, detail.thumbnailUrl].filter(
    (url): url is string => url !== null,
  )
  const uploadDate = detail.publishedAt?.toISOString() ?? detail.recordedAt
  if (thumbnailUrls.length === 0 || uploadDate === null) {
    return []
  }
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: detail.title,
      description: detail.description ?? detail.title,
      thumbnailUrl: thumbnailUrls,
      uploadDate,
      ...(detail.videoUrl !== null ? { contentUrl: detail.videoUrl } : {}),
      ...(detail.embedUrl !== null ? { embedUrl: detail.embedUrl } : {}),
      inLanguage: 'hu',
      ...(detail.tags.length > 0
        ? { keywords: detail.tags.map((tag) => tag.name).join(', ') }
        : {}),
    },
  ]
}

function VideoDetailPage() {
  const { detail } = Route.useLoaderData()
  const { t: startTime } = Route.useSearch()
  const viewerQuery = useQuery({
    queryKey: ['viewer'],
    queryFn: fetchViewerState,
    staleTime: 60_000,
  })
  const canEdit =
    viewerQuery.data?.loggedIn === true && viewerQuery.data.canAccessAdmin
  return (
    <main className="flex-1">
      <div className="flex w-full justify-center bg-black">
        {detail.embedUrl !== null ? (
          <div className="w-full max-w-6xl">
            <YoutubePlayer
              videoId={detail.id}
              embedUrl={detail.embedUrl}
              posterUrl={detail.keyframeUrl}
              title={detail.title}
              startTime={startTime}
            />
          </div>
        ) : detail.videoUrl !== null ? (
          <div className="w-full max-w-6xl">
            <VideoDetailPlayer
              videoId={detail.id}
              videoUrl={detail.videoUrl}
              hqUrl={detail.hqUrl}
              lqUrl={detail.lqUrl}
              posterUrl={detail.keyframeUrl ?? detail.thumbnailUrl}
              title={detail.title}
              startTime={startTime}
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

        {canEdit && (
          <Link
            to="/admin/videos/$id"
            params={{ id: detail.id }}
            className="my-4 inline-flex items-center gap-2 bg-(--orange) px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            Szerkesztés
          </Link>
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
                      params={{ slug: memberSlug(member) }}
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
                  <Thumbnail
                    src={related.thumbnailUrl}
                    largeSrc={related.keyframeUrl}
                    sizes={RELATED_THUMBNAIL_SIZES}
                    alt={related.title}
                  />
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
