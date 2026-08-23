import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { isAdminAreaAllowed, isLeadership } from '#/server/auth/policy.ts'

/** Session hiánya vagy lejárata: a kliensnek új bejelentkezést kell kérnie. */
export class AuthRequiredError extends Error {
  constructor(readonly loginUrl: string) {
    super('A bejelentkezés lejárt vagy nem történt meg.')
    this.name = 'AuthRequiredError'
  }
}

/** Be van jelentkezve, de nincs hozzá jog: magyar 403. */
export class ForbiddenError extends Error {
  constructor(message = 'Ehhez a művelethez nincs jogosultságod.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/**
 * Szerveroldali guard adminműveletekhez és -oldalakhoz.
 * Névtelen felhasználó belépésre irányítandó a megtartott returnTo-val
 * (AuthRequiredError.loginUrl), bejelentkezett, de jogosulatlan 403-at kap.
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
    // Vezetőségi terület névtelenül: általános belépési oldalra irányítunk.
    throw new AuthRequiredError(loginUrlFor('/'))
  }
  if (!isLeadership(viewer)) {
    throw new ForbiddenError()
  }
}

/** Publikus tartalom olvasásához soha nincs szükség guardra. */
export function viewerOrAnonymous(viewer: Viewer | null): Viewer {
  return viewer ?? anonymousViewer()
}

function loginUrlFor(returnTo: string): string {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}
