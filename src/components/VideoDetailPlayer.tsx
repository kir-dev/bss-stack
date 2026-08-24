'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Natív MP4-lejátszó (spec 5.5): natív vezérlők, poster, preload="metadata",
 * nincs autoplay és külön letöltés gomb. Az első sikeres `play` eseménynél
 * egyszer megszámolja a megtekintést; médiahiba magyar üzenetet és
 * újrapróbálást ad.
 */
export default function VideoDetailPlayer({
  videoId,
  videoUrl,
  posterUrl,
  title,
}: Readonly<{
  videoId: string
  videoUrl: string
  posterUrl?: string | null
  title: string
}>) {
  const countedRef = useRef(false)
  const [errorKey, setErrorKey] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    countedRef.current = false
  }, [videoId, videoUrl])

  function handlePlay() {
    if (countedRef.current) {
      return
    }
    countedRef.current = true
    void fetch(`/api/videos/${videoId}/view`, { method: 'POST' }).catch(
      () => {},
    )
  }

  if (failed) {
    return (
      <div className="flex w-full flex-col items-center gap-4 bg-black p-10 text-center text-white">
        <p role="alert">
          A videó lejátszása most nem sikerült. Ellenőrizd a kapcsolatot, majd
          próbáld újra.
        </p>
        <button
          type="button"
          onClick={() => setErrorKey((value) => value + 1)}
          className="bg-(--orange) px-4 py-2 font-bold"
        >
          Újrapróbálás
        </button>
      </div>
    )
  }

  return (
    <video
      key={errorKey}
      className="w-full bg-black"
      src={videoUrl}
      poster={posterUrl ?? undefined}
      controls
      preload="metadata"
      aria-label={title}
      onPlay={handlePlay}
      onError={() => setFailed(true)}
    />
  )
}
