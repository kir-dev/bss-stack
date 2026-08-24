/**
 * YouTube URL parsing. Needed on both the client and the server (at live
 * scheduling the editor already flags a bad URL while typing), which is why
 * it lives here; the network oEmbed check stays in the server-side module.
 */

/**
 * YouTube URL normalization (spec 9.3). Accepted forms:
 * youtube.com/watch?v=ID, youtube.com/live/ID, youtu.be/ID, embed/ID,
 * and youtube-nocookie.com variants. The result is always a video ID.
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

/** Validation warning for the live form, or `null` if the URL is fine. */
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
