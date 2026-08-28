'use client'

import { useCallback, useState } from 'react'

/** Every thumbnail is 16:9; a missing image also reserves that space. */
export const THUMBNAIL_FALLBACK_SRC = '/video-thumbnail.png'

export default function Thumbnail({
  src,
  alt,
  className = '',
  imgClassName = '',
  loading = 'lazy',
}: {
  src: string | null | undefined
  alt: string
  /** Extra classes applied to the 16:9 frame. */
  className?: string
  /** Extra classes applied to the `<img>` itself. */
  imgClassName?: string
  loading?: 'lazy' | 'eager'
}) {
  const resolvedSrc = src ?? THUMBNAIL_FALLBACK_SRC
  // We store the loaded URL rather than a plain boolean flag: this way the
  // placeholder resets automatically when `src` changes (e.g. on re-render
  // after filtering).
  const [settledSrc, setSettledSrc] = useState<string | null>(null)
  const loaded = settledSrc === resolvedSrc

  // The `load` event of an image arriving from cache can fire before hydration
  // completes, so we also check the `complete` flag via the ref — otherwise
  // the image would stay invisible.
  const measureRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (node !== null && node.complete) {
        setSettledSrc(resolvedSrc)
      }
    },
    [resolvedSrc],
  )

  return (
    <div className={`thumb-frame ${loaded ? '' : 'skeleton'} ${className}`}>
      <img
        ref={measureRef}
        src={resolvedSrc}
        alt={alt}
        loading={loading}
        decoding="async"
        width={1280}
        height={720}
        onLoad={() => setSettledSrc(resolvedSrc)}
        // On a broken URL, don't leave the skeleton flashing forever.
        onError={() => setSettledSrc(resolvedSrc)}
        className={`absolute inset-0 block h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName}`}
      />
    </div>
  )
}
