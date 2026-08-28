const MEDIA_HOST = 'https://v.bsstudio.hu'
const YOUTUBE_FRAME_HOSTS =
  'https://www.youtube-nocookie.com https://www.youtube.com'
// The live preview thumbnail comes from the YouTube CDN.
const YOUTUBE_IMAGE_HOSTS = 'https://i.ytimg.com'

export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    // TanStack Start's streaming scripts and the theme initializer are inline;
    // a separate nonce cannot be reliably introduced in the streaming response.
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

/** Baseline security headers for every response. */
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
