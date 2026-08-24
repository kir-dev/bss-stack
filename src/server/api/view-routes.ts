import { forbiddenPage, getRequestOrigin } from '#/server/api/http.ts'
import {
  readCookieValue,
  serializeSetCookie,
} from '#/server/auth/session-cookies.ts'
import type { CookieSpec } from '#/server/auth/session-cookies.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import {
  VIEW_SESSION_COOKIE_NAME,
  newViewSessionToken,
  recordVideoView,
  viewSessionCookieSpec,
} from '#/server/views/counter.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

import type { Database } from '#/server/auth/session-store.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface VideoViewDeps {
  db?: Database
}

/**
 * Megtekintésszámláló végpont (spec 5.5): az első sikeres `play` eseménynél
 * hívja a kliens. Egy böngésző-session videónként egyszer számol.
 */
export async function handleVideoView(
  request: Request,
  videoId: string,
  deps: VideoViewDeps = {},
): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json', allow: 'POST' },
    })
  }
  const origin = request.headers.get('origin')
  if (
    origin !== null &&
    origin !== '' &&
    origin !== getRequestOrigin(request)
  ) {
    return forbiddenPage()
  }
  if (!UUID_PATTERN.test(videoId)) {
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const { viewer } = await resolveViewerStateFromRequest(request)

  const existingToken = readCookieValue(request, VIEW_SESSION_COOKIE_NAME)
  const isNewSession = existingToken === null || existingToken === ''
  const token = isNewSession ? newViewSessionToken() : existingToken

  try {
    const db = deps.db ?? (await getDefaultDb())
    await recordVideoView(db, { videoId, viewer, token })
  } catch {
    // Ismeretlen, nem publikált vagy nem látható videó: nincs információszivárgás.
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  const headers = new Headers({ 'content-type': 'application/json' })
  if (isNewSession) {
    const secure = getRequestOrigin(request).startsWith('https://')
    const cookie: CookieSpec = viewSessionCookieSpec(token, secure)
    headers.append('set-cookie', serializeSetCookie(cookie))
  }
  return new Response(JSON.stringify({ counted: true }), {
    status: 200,
    headers,
  })
}
