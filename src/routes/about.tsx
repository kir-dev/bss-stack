import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAboutPageVideos } from '#/server/homepage/about.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

/**
 * About page text (spec 10.1): versioned plain text content;
 * changing it requires a code change.
 */
const ABOUT_TEXT_VERSION = 1

const ABOUT_TEXT = `A Budavári Schönherz Studió a BME Schönherz Kollázium öntevékeny köre.
Videókat készítünk az egyetemi életről, rendezvényeinkről és a kollégium közösségéről.
Tagjaink operatőri, vágói és riporteri gyakorlatot szereznek, miközben együtt dolgozunk a
legjobb egyetemi videótartalmakon.`

const loadAboutPage = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDefaultDb()
  const aboutVideos = await getAboutPageVideos(db)
  return aboutVideos.map((video) => ({
    id: video.id,
    slug: video.slug,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
  }))
})

export const Route = createFileRoute('/about')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['about-page'],
      queryFn: loadAboutPage,
      staleTime: 60_000,
    }),
  component: AboutPage,
})

function AboutPage() {
  const videos = Route.useLoaderData()

  return (
    <main className="mx-auto w-[90dvw] max-w-4xl my-[4dvh]">
      <title>Rólunk | BSS</title>
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">
        Mivel foglalkozunk?
      </h1>
      <div className="whitespace-pre-line text-lg text-(--bss-text-secondary)">
        {ABOUT_TEXT}
      </div>

      {videos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-(--bss-text)">
            Válogatott videóink
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
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
        </section>
      )}
    </main>
  )
}

export { ABOUT_TEXT_VERSION }
