/**
 * Biztonsági fejlécek és CSP (BSS-035, spec 16): a player (v.bsstudio.hu)
 * és a YouTube live embed (youtube-nocookie.com) működjön, minden más
 * külső tartalom tiltva.
 */

const MEDIA_HOST = 'https://v.bsstudio.hu'
const YOUTUBE_FRAME_HOSTS =
  'https://www.youtube-nocookie.com https://www.youtube.com'
// A live-előnézet thumbnailje a YouTube CDN-jéről érkezik.
const YOUTUBE_IMAGE_HOSTS = 'https://i.ytimg.com'

export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    // A TanStack Start streamelő szkriptjei és a téma-inicializáló inline-ek;
    // külön nonce a streaming válaszban nem vezethető be megbízhatóan.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${MEDIA_HOST} ${YOUTUBE_IMAGE_HOSTS}`,
    `media-src 'self' ${MEDIA_HOST}`,
    `frame-src ${YOUTUBE_FRAME_HOSTS}`,
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** Alap biztonsági headerek minden válaszra. */
export function securityHeaders(): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }
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
