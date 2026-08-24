'use client'

import { useCallback, useState } from 'react'

/** Minden borítókép 16:9, a hiányzó kép is ezt a helyet foglalja. */
export const THUMBNAIL_FALLBACK_SRC = '/video-thumbnail.png'

/**
 * Borítókép fix 16:9 kerettel (BSS-019 UI): a keret a kép megérkezése előtt
 * is elfoglalja a helyét, így a rács nem ugrik meg betöltés közben. Amíg a
 * kép nincs kész, a keret skeletonként villog; a kép utána beúszik.
 */
export default function Thumbnail({
  src,
  alt,
  className = '',
  imgClassName = '',
  loading = 'lazy',
}: {
  src: string | null | undefined
  alt: string
  /** A 16:9 keretre kerülő extra osztályok. */
  className?: string
  /** Magára a `<img>`-re kerülő extra osztályok. */
  imgClassName?: string
  loading?: 'lazy' | 'eager'
}) {
  const resolvedSrc = src ?? THUMBNAIL_FALLBACK_SRC
  // A betöltött URL-t tároljuk, nem egy sima logikai jelzőt: így `src`-váltásra
  // (pl. szűrés utáni újrarenderelésre) magától visszaáll a helyőrző.
  const [settledSrc, setSettledSrc] = useState<string | null>(null)
  const loaded = settledSrc === resolvedSrc

  // A gyorsítótárból érkező kép `load` eseménye lefuthat még a hidratálás
  // előtt, ezért a `complete` jelzőt a ref-ben is megnézzük – különben a kép
  // láthatatlan maradna.
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
        // Hibás URL esetén se maradjon a skeleton örökre villogva.
        onError={() => setSettledSrc(resolvedSrc)}
        className={`absolute inset-0 block h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName}`}
      />
    </div>
  )
}
