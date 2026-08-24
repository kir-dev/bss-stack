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
  /** Navbarban kiírt név: a tagprofil teljes neve, hiányában a felhasználónév. */
  displayName: string | null
  /** Profilkép a tagprofilból; hiányában a navbar monogramot rajzol. */
  avatarUrl: string | null
  /** Látszik-e az adminfelület a menüben (legalább tag). */
  canAccessAdmin: boolean
}

/**
 * A navbar belépési állapota (BSS-019). Csak a helyi session-ből és a
 * tagcache-ből dönt, Authentik-hívás nélkül; a kliens a `/api/auth/me`
 * végpontot is használhatja.
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
 * Név és profilkép a tagcache-ből. A navbar nem eshet szét attól, hogy egy
 * belépett nézőhöz (pl. Schönherz-szintű felhasználóhoz) nincs tagprofil,
 * vagy hogy a lekérdezés hibára fut – ilyenkor a felhasználónév marad.
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
