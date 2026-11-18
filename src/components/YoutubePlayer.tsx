'use client'

import { useState } from 'react'
import { THUMBNAIL_FALLBACK_SRC } from '#/components/Thumbnail.tsx'
import { youtubeAutoplayUrl } from '#/lib/youtube-url.ts'

/** Loads the YouTube embed only on click; that click counts the view. */
export default function YoutubePlayer({
  videoId,
  embedUrl,
  posterUrl,
  title,
  startTime,
}: Readonly<{
  videoId: string
  embedUrl: string
  posterUrl: string | null
  title: string
  startTime?: number
}>) {
  const [isLoaded, setIsLoaded] = useState(false)

  function load() {
    setIsLoaded(true)
    void fetch(`/api/videos/${videoId}/view`, { method: 'POST' }).catch(
      () => {},
    )
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black text-white shadow-2xl">
      {isLoaded ? (
        <iframe
          src={youtubeAutoplayUrl(embedUrl, startTime)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={load}
          aria-label={`Lejátszás: ${title}`}
          className="group/poster absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
        >
          <img
            src={posterUrl ?? THUMBNAIL_FALLBACK_SRC}
            alt=""
            decoding="async"
            className="h-full w-full object-cover"
          />
          <span className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white/80 bg-(--blue)/90 shadow-xl transition group-hover/poster:scale-105 group-hover/poster:bg-(--orange) sm:size-20">
            <span
              aria-hidden="true"
              className="mask-center mask-no-repeat mask-contain size-8 bg-current"
              style={{ maskImage: 'url(/icons/play.svg)' }}
            />
          </span>
        </button>
      )}
    </div>
  )
}
