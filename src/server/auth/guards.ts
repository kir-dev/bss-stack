import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { isAdminAreaAllowed, isLeadership } from '#/server/auth/policy.ts'

/** Missing or expired session: the client must request a new login. */
export class AuthRequiredError extends Error {
  constructor(readonly loginUrl: string) {
    super('A bejelentkezés lejárt vagy nem történt meg.')
    this.name = 'AuthRequiredError'
  }
}

/** Logged in, but lacks the required permission: 403. */
export class ForbiddenError extends Error {
  constructor(message = 'Ehhez a művelethez nincs jogosultságod.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/**
 * Server-side guard for admin operations and pages.
 * Anonymous users are redirected to login with the preserved returnTo
 * (AuthRequiredError.loginUrl); logged-in but unauthorized users get a 403.
 */
export function requireAdmin(viewer: Viewer, returnTo: string): void {
  if (viewer.level === 'anonymous') {
    throw new AuthRequiredError(loginUrlFor(returnTo))
  }
  if (!isAdminAreaAllowed(viewer)) {
    throw new ForbiddenError()
  }
}

export function requireLeadership(viewer: Viewer): void {
  if (viewer.level === 'anonymous') {
    // Leadership area while anonymous: redirect to the generic login page.
    throw new AuthRequiredError(loginUrlFor('/'))
  }
  if (!isLeadership(viewer)) {
    throw new ForbiddenError()
  }
}

/** Reading public content never requires a guard. */
export function viewerOrAnonymous(viewer: Viewer | null): Viewer {
  return viewer ?? anonymousViewer()
}

function loginUrlFor(returnTo: string): string {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}
