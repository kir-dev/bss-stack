import type { OobConfig } from '#/server/config/oob-schema.ts'
import type { AuthSessionRecord } from '#/server/auth/session-store.ts'

export type ViewerLevel = 'anonymous' | 'schonherz' | 'member' | 'leadership'

const LEVEL_RANK: Record<ViewerLevel, number> = {
  anonymous: 0,
  schonherz: 1,
  member: 2,
  leadership: 3,
}

export interface Viewer {
  level: ViewerLevel
  /** Authentik sub; null for anonymous. */
  sub: string | null
  username: string | null
}

export function anonymousViewer(): Viewer {
  return { level: 'anonymous', sub: null, username: null }
}

export function resolveViewerLevel(
  groups: ReadonlyArray<string>,
  config: OobConfig['authentik'],
): ViewerLevel {
  const has = (groupName: string): boolean => groups.includes(groupName)
  if (has(config.groups.admin) || has(config.groups.leadership)) {
    return 'leadership'
  }
  if (
    has(config.groups.studio) ||
    has(config.groups.studioCandidate) ||
    has(config.groups.studioCandidateCandidate) ||
    has(config.groups.alumni)
  ) {
    return 'member'
  }
  return 'anonymous'
}

export function viewerFromIdentity(
  identity: { sub: string; username: string; groups: string[] },
  config: OobConfig['authentik'],
): Viewer {
  return {
    level: resolveViewerLevel(identity.groups, config),
    sub: identity.sub,
    username: identity.username,
  }
}

export function viewerFromSession(
  session: AuthSessionRecord | null,
  config: OobConfig['authentik'],
): Viewer {
  if (session === null) {
    return anonymousViewer()
  }
  return {
    level: resolveViewerLevel(session.groups, config),
    sub: session.memberSub,
    username: session.username,
  }
}

export function atLeast(viewer: Viewer, level: ViewerLevel): boolean {
  return LEVEL_RANK[viewer.level] >= LEVEL_RANK[level]
}
