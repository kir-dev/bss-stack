/**
 * YouTube URL parsing. Needed on both the client and the server (at live
 * scheduling the editor already flags a bad URL while typing), which is why
 * it lives here; the network oEmbed check stays in the server-side module.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/

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
      const id = url.pathname.split('/').filter(Boolean).at(0)
      return id !== undefined && VIDEO_ID_PATTERN.test(id) ? id : null
    }
    if (!isYoutube) {
      return null
    }
    if (url.pathname === '/watch') {
      const v = url.searchParams.get('v')
      if (v !== null && VIDEO_ID_PATTERN.test(v)) {
        return v
      }
      return null
    }
    const parts = url.pathname.split('/').filter(Boolean)
    for (const segment of ['live', 'embed', 'shorts']) {
      if (parts[0] === segment) {
        const id = parts.at(1)
        return id !== undefined && VIDEO_ID_PATTERN.test(id) ? id : null
      }
    }
    return null
  } catch {
    return null
  }
}

export function buildYoutubeNocookieEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

export function youtubeImageUrl(
  videoId: string,
  name: 'mqdefault' | 'hqdefault' | 'maxresdefault',
): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${name}.jpg`
}

export function youtubeAutoplayUrl(
  embedUrl: string,
  startSeconds?: number,
): string {
  const url = new URL(embedUrl)
  url.searchParams.set('autoplay', '1')
  const start = Math.floor(startSeconds ?? 0)
  if (Number.isFinite(start) && start > 0) {
    url.searchParams.set('start', String(start))
  }
  return url.toString()
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
