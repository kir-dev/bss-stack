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
  /** A néző jogosultsági szintje és azonosítói (névtelenül is értelmes). */
  viewer: Viewer
  /** Be van jelentkezve (nem névtelen session). */
  loggedIn: boolean
}

/**
 * Nézői állapot feloldása egy kérésből: csak a helyi DB-ben tárolt session-ből,
 * az Authentiket soha nem hívja (spec 8.2 — a publikus kérés nem függhet
 * külső szolgáltatástól). Hibás/lejárt session esetén névtelen nézőt ad.
 */
export async function resolveViewerStateFromRequest(
  request: Request,
  deps: { db?: Database; clock?: Clock; config?: OobConfig } = {},
): Promise<ViewerState> {
  let config: OobConfig
  try {
    config = deps.config ?? getCachedOobConfig()
  } catch {
    // OOB config nélkül a publikus oldalak névtelenül is működjenek;
    // a belépés külön hibaoldalt kap az auth-végpontoktól.
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
