import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { resolveViewerStateFromRequest } from './viewer.ts'

export interface ViewerStateDto {
  level: 'anonymous' | 'schonherz' | 'member' | 'leadership'
  username: string | null
  loggedIn: boolean
}

/**
 * A navbar belépési állapota (BSS-019). Csak a helyi session-ből dönt,
 * Authentik-hívás nélkül; a kliens a `/api/auth/me` végpontot is használhatja.
 */
export const fetchViewerState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ViewerStateDto> => {
    const state = await resolveViewerStateFromRequest(getRequest())
    return {
      level: state.viewer.level,
      username: state.viewer.username,
      loggedIn: state.loggedIn,
    }
  },
)
