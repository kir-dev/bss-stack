import type { CookieSpec } from '#/server/auth/session-cookies.ts'
import { serializeSetCookie } from '#/server/auth/session-cookies.ts'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function errorPage(status: number, title: string, message: string): Response {
  const html =
    `<!DOCTYPE html>\n<html lang="hu">\n<head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title></head>\n` +
    `<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>` +
    `<p><a href="/">Vissza a főoldalra</a></p></main></body>\n</html>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

export function badRequestPage(message: string): Response {
  return errorPage(400, 'Hibás kérés', message)
}

export function unauthorizedConfigPage(): Response {
  return errorPage(
    500,
    'Szerverkonfigurációs hiba',
    'A BSS OOB konfiguráció nem elérhető vagy érvénytelen. Indítsd el a `pnpm infra:bootstrap` lépést, majd ellenőrizd a `pnpm check:oob` paranccsal.',
  )
}

export function authUnavailablePage(): Response {
  return errorPage(
    503,
    'Bejelentkezés nem elérhető',
    'A bejelentkezési szolgáltatás (Authentik) most nem érhető el. A publikus oldalak működnek; próbáld újra később.',
  )
}

export function authFailurePage(message: string): Response {
  return errorPage(502, 'Bejelentkezési hiba', message)
}

export function internalErrorPage(message: string): Response {
  return errorPage(500, 'Szerverhiba', message)
}

export function forbiddenPage(): Response {
  return errorPage(
    403,
    'Hozzáférés megtagadva',
    'Ehhez a művelethez nincs jogosultságod.',
  )
}

export function apiNotFoundResponse(): Response {
  return new Response(JSON.stringify({ error: 'not_found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
}

export function redirectResponse(
  location: string,
  cookies: CookieSpec[] = [],
): Response {
  const headers = new Headers({ location: location })
  for (const cookie of cookies) {
    headers.append('set-cookie', serializeSetCookie(cookie))
  }
  return new Response(null, { status: 302, headers })
}

/** Only a relative, single-level path starting with "/" is allowed (against open redirects). */
export function sanitizeReturnTo(raw: string | null): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\')
  ) {
    return '/'
  }
  if (raw.length > 2048) {
    return '/'
  }
  return raw
}

export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const host = forwardedHost ?? request.headers.get('host') ?? url.host
  const proto = forwardedProto ?? url.protocol.replace(/:$/, '')
  return `${proto}://${host}`
}

export function isSecureRequest(request: Request): boolean {
  return getRequestOrigin(request).startsWith('https://')
}
