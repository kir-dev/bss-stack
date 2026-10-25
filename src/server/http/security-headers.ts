import { getCachedOobConfig } from '#/server/config/load.ts'

const YOUTUBE_FRAME_HOSTS =
  'https://www.youtube-nocookie.com https://www.youtube.com'
// The contact page embeds the studio's location from Google Maps.
const MAP_FRAME_HOSTS = 'https://www.google.com'
// The live preview thumbnail comes from the YouTube CDN.
const YOUTUBE_IMAGE_HOSTS = 'https://i.ytimg.com'
const AVATAR_IMAGE_HOSTS = 'https://backstage.bsstudio.hu'

export function contentSecurityPolicy(
  mediaHost = getCachedOobConfig().media.host,
): string {
  return [
    "default-src 'self'",
    // TanStack Start's streaming scripts and the theme initializer are inline;
    // a separate nonce cannot be reliably introduced in the streaming response.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${mediaHost} ${YOUTUBE_IMAGE_HOSTS} ${AVATAR_IMAGE_HOSTS}`,
    `media-src 'self' ${mediaHost}`,
    `frame-src ${YOUTUBE_FRAME_HOSTS} ${MAP_FRAME_HOSTS}`,
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** Baseline security headers for every response. */
export function securityHeaders(
  mediaHost = getCachedOobConfig().media.host,
): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(mediaHost),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }
}

// Responses that do not need the OOB config (robots.txt, the sitemap, the API)
// must not fail without it; no media can load then anyway, so the CSP leaves it
// out. The failure is logged and remembered: the config is read once per
// process, so retrying it on every request would only repeat the disk read.
let mediaHostFallback: string | null = null

function configuredMediaHost(): string {
  if (mediaHostFallback !== null) {
    return mediaHostFallback
  }
  try {
    return getCachedOobConfig().media.host
  } catch (error) {
    console.error(
      '[security-headers] Az OOB config nem tölthető be, a CSP médiahost nélkül megy ki:',
      error,
    )
    mediaHostFallback = ''
    return mediaHostFallback
  }
}

/** Adds the baseline headers that the response does not set itself. */
export function withSecurityHeaders(
  response: Response,
  mediaHost?: string,
): Response {
  const headers = new Headers(response.headers)
  // The CSP (and the media host it needs) is built only if the response does
  // not bring its own, like the sitemap does.
  const baseline = securityHeaders(
    headers.has('content-security-policy')
      ? ''
      : (mediaHost ?? configuredMediaHost()),
  )
  for (const [name, value] of Object.entries(baseline)) {
    if (!headers.has(name)) {
      headers.set(name, value)
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /search',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}
