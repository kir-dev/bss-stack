import {
  readCookieValue,
  SESSION_COOKIE_NAME,
} from '#/server/auth/session-cookies.ts'
import { findActiveAuthSession } from '#/server/auth/session-store.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { anonymousViewer, viewerFromSession } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { getCachedOobConfig } from '#/server/config/load.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import type { Clock } from '#/lib/clock.ts'

export interface ViewerState {
  /** The viewer's authorization level and identifiers (meaningful even when anonymous). */
  viewer: Viewer
  /** Logged in (not an anonymous session). */
  loggedIn: boolean
}

export async function resolveViewerStateFromRequest(
  request: Request,
  deps: { db?: Database; clock?: Clock; config?: OobConfig } = {},
): Promise<ViewerState> {
  let config: OobConfig
  try {
    config = deps.config ?? getCachedOobConfig()
  } catch {
    // Without OOB config the public pages should work even anonymously;
    // login gets its own error page, separate from the auth endpoints.
    return { viewer: anonymousViewer(), loggedIn: false }
  }

  const token = readCookieValue(request, SESSION_COOKIE_NAME)
  if (token === null || token === '') {
    return { viewer: anonymousViewer(), loggedIn: false }
  }

  try {
    const session = await findActiveAuthSession(token, {
      db: deps.db,
      clock: deps.clock,
    })
    const viewer = viewerFromSession(session, config.authentik)
    return { viewer, loggedIn: viewer.level !== 'anonymous' }
  } catch {
    return { viewer: anonymousViewer(), loggedIn: false }
  }
}
