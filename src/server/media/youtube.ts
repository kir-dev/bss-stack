import type { OobConfig } from '#/server/config/oob-schema.ts'

export interface YoutubeCheckResult {
  ok: boolean
  /** Normalizált YouTube videóazonosító; érvénytelen URL esetén null. */
  videoId: string | null
  problems: string[]
}

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

/** Embed URL készítése a normalizált azonosítóból (megjelenítéshez, nocookie). */
export function buildYoutubeNocookieEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

/**
 * oEmbed ellenőrzés (mentéskor és aktiváláskor): a videóazonosítóhoz
 * lekérdezzük az oEmbed végpontot; csak 200 válasz elfogadott.
 */
export async function validateYoutubeVideo(
  rawUrl: string,
  config: OobConfig['youtube'],
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<YoutubeCheckResult> {
  const videoId = normalizeYoutubeVideoId(rawUrl)
  if (videoId === null) {
    return {
      ok: false,
      videoId: null,
      problems: [
        'A YouTube URL formátuma nem elfogadott (watch, live, youtu.be vagy embed link kell).',
      ],
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 10_000,
  )

  try {
    const oembedUrl = new URL(config.oEmbedEndpoint)
    oembedUrl.searchParams.set(
      'url',
      `https://www.youtube.com/watch?v=${videoId}`,
    )
    oembedUrl.searchParams.set('format', 'json')

    const response = await fetchImpl(oembedUrl.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        videoId,
        problems: ['A YouTube videó privát vagy bejelentkezéshez kötött.'],
      }
    }
    if (response.status !== 200) {
      return {
        ok: false,
        videoId,
        problems: [
          'A YouTube videó nem elérhető az oEmbed ellenőrzésen (törölt vagy hibás azonosító).',
        ],
      }
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      return {
        ok: false,
        videoId,
        problems: ['Az oEmbed válasz nem értelmezhető.'],
      }
    }
    if (typeof parsed !== 'object' || parsed === null || !('title' in parsed)) {
      return {
        ok: false,
        videoId,
        problems: ['Az oEmbed válasz nem YouTube videót ír le.'],
      }
    }

    return { ok: true, videoId, problems: [] }
  } catch (error) {
    console.error('[youtube] oEmbed hiba:', error)
    return {
      ok: false,
      videoId,
      problems: [
        'Az oEmbed ellenőrzés most nem elérhető. Próbáld újra később.',
      ],
    }
  } finally {
    clearTimeout(timer)
  }
}
