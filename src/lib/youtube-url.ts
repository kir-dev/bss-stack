/**
 * YouTube URL értelmezés. Kliens- és szerveroldalon egyaránt kell (a live
 * ütemezésnél a szerkesztő már írás közben jelzi a hibás URL-t), ezért él
 * itt, a hálózati oEmbed ellenőrzés pedig a szerveroldali modulban.
 */

/**
 * YouTube URL normalizálás (spec 9.3). Elfogadott formák:
 * youtube.com/watch?v=ID, youtube.com/live/ID, youtu.be/ID, embed/ID,
 * youtube-nocookie.com változatok. Az eredmény mindig videóazonosító.
 */
export function normalizeYoutubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const hostname = url.hostname.replace(/^www\./, '')
    const isYoutube =
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtube-nocookie.com'
    const isShort = hostname === 'youtu.be'

    if (isShort) {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length === 0) {
        return null
      }
      return parts[0]
    }
    if (!isYoutube) {
      return null
    }
    if (url.pathname === '/watch') {
      const v = url.searchParams.get('v')
      if (v !== null && /^[A-Za-z0-9_-]{6,20}$/.test(v)) {
        return v
      }
      return null
    }
    const parts = url.pathname.split('/').filter(Boolean)
    for (const segment of ['live', 'embed', 'shorts']) {
      if (parts[0] === segment) {
        const id = parts.at(1)
        return id !== undefined && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null
      }
    }
    return null
  } catch {
    return null
  }
}

/** Magyar figyelmeztetés a live űrlaphoz, vagy `null`, ha az URL rendben. */
export function youtubeUrlWarning(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  if (trimmed === '') {
    return null
  }
  if (normalizeYoutubeVideoId(trimmed) === null) {
    return 'A YouTube URL nem értelmezhető: watch?v=, live/, embed/, shorts/ vagy youtu.be/ alak szükséges.'
  }
  return null
}
