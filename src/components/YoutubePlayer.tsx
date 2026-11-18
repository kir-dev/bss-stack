'use client'

import { useCallback, useState } from 'react'
import { THUMBNAIL_FALLBACK_SRC } from '#/components/Thumbnail.tsx'
import {
  normalizeYoutubeVideoId,
  youtubeAutoplayUrl,
  youtubeImageUrl,
} from '#/lib/youtube-url.ts'

// YouTube answers a missing image size with a 120×90 placeholder, not an error.
const MIN_POSTER_WIDTH = 480

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
          <PosterImage embedUrl={embedUrl} posterUrl={posterUrl} />
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

/** Tries the largest YouTube image first, then the given poster. */
function PosterImage({
  embedUrl,
  posterUrl,
}: Readonly<{ embedUrl: string; posterUrl: string | null }>) {
  const youtubeId = normalizeYoutubeVideoId(embedUrl)
  const candidates = [
    youtubeId !== null ? youtubeImageUrl(youtubeId, 'maxresdefault') : null,
    posterUrl,
  ].filter((url): url is string => url !== null)
  const [rejectedSrcs, setRejectedSrcs] = useState<string[]>([])
  const [readySrc, setReadySrc] = useState<string | null>(null)
  const src =
    candidates.find((url) => !rejectedSrcs.includes(url)) ??
    THUMBNAIL_FALLBACK_SRC

  function settle(image: HTMLImageElement) {
    const settledSrc = image.getAttribute('src') ?? ''
    if (
      settledSrc === THUMBNAIL_FALLBACK_SRC ||
      image.naturalWidth >= MIN_POSTER_WIDTH
    ) {
      setReadySrc(settledSrc)
    } else {
      setRejectedSrcs((rejected) =>
        rejected.includes(settledSrc) ? rejected : [...rejected, settledSrc],
      )
    }
  }

  // An image cached before hydration fires `load` before React listens.
  const measureRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (node !== null && node.complete) {
        settle(node)
      }
    },
    [src],
  )

  return (
    <img
      key={src}
      ref={measureRef}
      src={src}
      alt=""
      decoding="async"
      onLoad={(event) => settle(event.currentTarget)}
      onError={(event) => settle(event.currentTarget)}
      className={`h-full w-full object-cover transition-opacity duration-300 ${readySrc === src ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}
