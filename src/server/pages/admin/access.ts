import {
  AuthRequiredError,
  ForbiddenError,
  requireAdmin,
  requireLeadership,
} from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'

/**
 * Admin terület elérési eredménye. A route-ok loaderéből hívva dönt:
 * - névtelen: belépésre irányítás a megtartott returnTo-val;
 * - bejelentkezett jogosulatlan: magyar 403 tartalom;
 * - egyébként OK.
 * A szerver minden oldal- és API-kérésnél újra ellenőrzi (spec 14).
 */
export type AreaAccess =
  | { kind: 'ok'; viewer: Pick<Viewer, 'level' | 'sub' | 'username'> }
  | { kind: 'login'; loginUrl: string }
  | { kind: 'forbidden' }

export function adminAreaAccess(viewer: Viewer, returnTo: string): AreaAccess {
  try {
    requireAdmin(viewer, returnTo)
    return { kind: 'ok', viewer }
  } catch (error) {
    return accessFromError(error)
  }
}

export function leadershipAreaAccess(viewer: Viewer): AreaAccess {
  try {
    requireLeadership(viewer)
    return { kind: 'ok', viewer }
  } catch (error) {
    return accessFromError(error)
  }
}

function accessFromError(error: unknown): AreaAccess {
  if (error instanceof AuthRequiredError) {
    return { kind: 'login', loginUrl: error.loginUrl }
  }
  if (error instanceof ForbiddenError) {
    return { kind: 'forbidden' }
  }
  throw error
}
