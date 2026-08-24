import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { adminAreaAccess, leadershipAreaAccess } from './access.ts'

export interface AdminAccessDto {
  kind: 'ok' | 'login' | 'forbidden'
  loginUrl?: string
  viewer?: { level: string; sub: string | null; username: string | null }
}

/** Admin váz guardja (BSS-027): session cookie-ból, Authentik-hívás nélkül. */
export const fetchAdminAreaAccess = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminAccessDto> => {
    return toDto(
      adminAreaAccess(
        (await resolveViewerStateFromRequest(getRequest())).viewer,
        currentPath(),
      ),
    )
  },
)

/** Vezetőségi területek (tagok, audit) külön, szigorúbb guardja. */
export const fetchLeadershipAreaAccess = createServerFn({
  method: 'GET',
}).handler(async (): Promise<AdminAccessDto> => {
  return toDto(
    leadershipAreaAccess(
      (await resolveViewerStateFromRequest(getRequest())).viewer,
    ),
  )
})

function currentPath(): string {
  try {
    return new URL(getRequest().url).pathname
  } catch {
    return '/admin'
  }
}

function toDto(access: ReturnType<typeof adminAreaAccess>): AdminAccessDto {
  if (access.kind === 'login') {
    return { kind: 'login', loginUrl: access.loginUrl }
  }
  if (access.kind === 'forbidden') {
    return { kind: 'forbidden' }
  }
  return {
    kind: 'ok',
    viewer: {
      level: access.viewer.level,
      sub: access.viewer.sub,
      username: access.viewer.username,
    },
  }
}
