import {
  AuthRequiredError,
  ForbiddenError,
  requireAdmin,
  requireLeadership,
} from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'

/**
 * Access result for the admin area. When called from a route's loader it decides:
 * - anonymous: redirect to login with the preserved returnTo;
 * - logged in but unauthorized: Hungarian 403 content;
 * - otherwise OK.
 * The server re-checks on every page and API request (spec 14).
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
