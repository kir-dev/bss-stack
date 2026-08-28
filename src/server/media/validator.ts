import { DEFAULT_MEDIA_HOSTS } from '#/lib/media-url.ts'

export const MEDIA_CONNECT_TIMEOUT_MS = 5_000
export const MEDIA_TOTAL_TIMEOUT_MS = 15_000

export interface MediaCheckResult {
  ok: boolean
  /** Problems phrased for the end user. */
  problems: string[]
}

export type MediaKind = 'video' | 'thumbnail'

export interface MediaConfig {
  allowedHosts: readonly string[]
}

export const DEFAULT_MEDIA_CONFIG: MediaConfig = {
  allowedHosts: DEFAULT_MEDIA_HOSTS,
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

export function isAllowedMediaHost(
  rawUrl: string,
  config: MediaConfig,
): boolean {
  const url = parseUrl(rawUrl)
  if (url === null) {
    return false
  }
  if (url.protocol !== 'https:') {
    return false
  }
  return config.allowedHosts.includes(url.hostname)
}

/**
 * Check without a network call: URL shape and host. When saving a draft this
 * is the only mandatory check; an invalid URL can still be saved as a draft.
 */
export function checkMediaUrlShape(
  rawUrl: string,
  kind: MediaKind,
  config: MediaConfig,
): MediaCheckResult {
  const problems: string[] = []
  const url = parseUrl(rawUrl)
  if (url === null) {
    problems.push('A megadott URL érvénytelen.')
    return { ok: false, problems }
  }
  if (url.protocol !== 'https:') {
    problems.push('A média URL csak https:// lehet.')
  }
  if (!config.allowedHosts.includes(url.hostname)) {
    problems.push(
      `A média csak a következő hostokról tölthető be: ${config.allowedHosts.join(', ')}.`,
    )
  }
  if (rawUrl.length > 2048) {
    problems.push('Az URL legfeljebb 2048 karakter lehet.')
  }
  void kind
  return { ok: problems.length === 0, problems }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('időtúllépés'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      timeoutPromise,
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

function expectedContentType(kind: MediaKind): string {
  return kind === 'video' ? 'video/mp4' : 'image/'
}

function contentTypeProblem(
  kind: MediaKind,
  contentType: string | null,
): string | null {
  if (contentType === null || contentType === '') {
    return 'A szerver nem adott meg content-type fejlécet.'
  }
  const expected = expectedContentType(kind)
  if (kind === 'video') {
    if (!contentType.startsWith(expected)) {
      return `Videó helyett ${contentType} típusú tartalom érkezett.`
    }
    return null
  }
  if (!contentType.startsWith(expected)) {
    return `Kép helyett ${contentType} típusú tartalom érkezik.`
  }
  return null
}

export async function validateMediaForPublish(params: {
  url: string
  kind: MediaKind
  mediaConfig: MediaConfig
  connectTimeoutMs?: number
  totalTimeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<MediaCheckResult> {
  const shape = checkMediaUrlShape(params.url, params.kind, params.mediaConfig)
  if (!shape.ok) {
    return shape
  }

  const fetchImpl = params.fetchImpl ?? fetch
  const connectTimeout = params.connectTimeoutMs ?? MEDIA_CONNECT_TIMEOUT_MS
  const totalTimeout = params.totalTimeoutMs ?? MEDIA_TOTAL_TIMEOUT_MS

  let headResponse: Response
  try {
    headResponse = await fetchWithTimeout(
      params.url,
      { method: 'HEAD', redirect: 'manual' },
      totalTimeout,
      fetchImpl,
    )
  } catch {
    return {
      ok: false,
      problems: ['A média nem érhető el (időtúllépés vagy kapcsolódási hiba).'],
    }
  }

  // Redirects are not accepted: a 3xx response indicates missing/bad media.
  if (headResponse.status >= 300 && headResponse.status < 400) {
    return {
      ok: false,
      problems: ['A média URL átirányítást ad, ez nem fogadható el.'],
    }
  }

  if (headResponse.status === 405 || headResponse.status === 501) {
    // Fallback: one-byte Range GET.
    let getResponse: Response
    try {
      getResponse = await fetchWithTimeout(
        params.url,
        {
          method: 'GET',
          redirect: 'manual',
          headers: { range: 'bytes=0-0' },
        },
        Math.max(totalTimeout, connectTimeout),
        fetchImpl,
      )
    } catch {
      return {
        ok: false,
        problems: ['A média tartalékellenőrzése nem sikerült (időtúllépés).'],
      }
    }

    if (getResponse.status !== 200 && getResponse.status !== 206) {
      return {
        ok: false,
        problems: [`A média nem érhető el: HTTP ${getResponse.status}.`],
      }
    }
    const contentType = getResponse.headers.get('content-type')
    const problem = contentTypeProblem(params.kind, contentType)
    if (problem !== null) {
      return { ok: false, problems: [problem] }
    }
    return { ok: true, problems: [] }
  }

  if (headResponse.status !== 200) {
    return {
      ok: false,
      problems: [`A média nem érhető el: HTTP ${headResponse.status}.`],
    }
  }

  const contentType = headResponse.headers.get('content-type')
  const problem = contentTypeProblem(params.kind, contentType)
  if (problem !== null) {
    return { ok: false, problems: [problem] }
  }

  return { ok: true, problems: [] }
}
