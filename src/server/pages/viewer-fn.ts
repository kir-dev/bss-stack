import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { memberCache } from '#/db/schema.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { isAdminAreaAllowed } from '#/server/auth/policy.ts'
import { resolveViewerStateFromRequest } from './viewer.ts'

export interface ViewerStateDto {
  level: 'anonymous' | 'schonherz' | 'member' | 'leadership'
  username: string | null
  loggedIn: boolean
  /** Name shown in the navbar: the member profile's full name, or the username if missing. */
  displayName: string | null
  /** Profile picture from the member profile; the navbar draws a monogram if missing. */
  avatarUrl: string | null
  /** Whether the admin area is visible in the menu (at least a member). */
  canAccessAdmin: boolean
}

/**
 * The navbar's login state (BSS-019). It decides only from the local session
 * and the member cache, without Authentik calls; the client may also use the
 * `/api/auth/me` endpoint.
 */
export const fetchViewerState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ViewerStateDto> => {
    const state = await resolveViewerStateFromRequest(getRequest())
    const profile =
      state.loggedIn && state.viewer.sub !== null
        ? await findMemberProfile(state.viewer.sub)
        : null

    return {
      level: state.viewer.level,
      username: state.viewer.username,
      loggedIn: state.loggedIn,
      displayName: profile?.fullName ?? state.viewer.username,
      avatarUrl: profile?.avatarUrl ?? null,
      canAccessAdmin: isAdminAreaAllowed(state.viewer),
    }
  },
)

/**
 * Name and profile picture from the member cache. The navbar must not break
 * because a logged-in viewer (e.g. a user with `schonherz` level) has no member
 * profile, or because the query fails – in that case the username is kept.
 */
async function findMemberProfile(
  sub: string,
): Promise<{ fullName: string; avatarUrl: string | null } | null> {
  try {
    const db = await getDefaultDb()
    const rows = await db
      .select({
        fullName: memberCache.fullName,
        avatarUrl: memberCache.avatarUrl,
      })
      .from(memberCache)
      .where(eq(memberCache.sub, sub))
      .limit(1)
    return rows.at(0) ?? null
  } catch {
    return null
  }
}
