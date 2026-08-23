import type { OobConfig } from '#/server/config/oob-schema.ts'

export const MEDIA_CONNECT_TIMEOUT_MS = 5_000
export const MEDIA_TOTAL_TIMEOUT_MS = 15_000

export interface MediaCheckResult {
  ok: boolean
  /** Magyar, felhasználónak szóló problémák. */
  problems: string[]
}

export type MediaKind = 'video' | 'thumbnail'

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

/** Host engedélylista (spec 5.4): csak a konfigurált médiahostok engedélyezettek. */
export function isAllowedMediaHost(
  rawUrl: string,
  config: OobConfig['media'],
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
 * Hálózati hívás nélküli ellenőrzés: URL forma és host. Piszkózat mentésekor
 * ez az egyetlen kötelező vizsgálat; a hibás URL így is menthető piszkozatban.
 */
export function checkMediaUrlShape(
  rawUrl: string,
  kind: MediaKind,
  config: OobConfig['media'],
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

/**
 * Publikálás előtti teljes médiaellenőrzés (spec 5.4):
 * - HEAD kérés, átirányítás nélküli 200 válasz elfogadott;
 * - videónál video/mp4, képnél image/* content-type kell;
 * - 405 vagy 501 esetén egybájtos Range GET tartalékellenőrzés fut;
 * - a fájl tartalmát soha nem töltjük le, csak a fejléceket olvassuk.
 */
export async function validateMediaForPublish(params: {
  url: string
  kind: MediaKind
  mediaConfig: OobConfig['media']
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

  // Átirányítás nem elfogadott: 3xx válasz a hiányzó/rossz médiára utal.
  if (headResponse.status >= 300 && headResponse.status < 400) {
    return {
      ok: false,
      problems: ['A média URL átirányítást ad, ez nem fogadható el.'],
    }
  }

  if (headResponse.status === 405 || headResponse.status === 501) {
    // Tartalék: egybájtos Range GET.
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
