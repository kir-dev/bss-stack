import type { OobConfig } from '#/server/config/oob-schema.ts'
import type { AuthSessionRecord } from '#/server/auth/session-store.ts'

/** Order of viewer levels according to chapter 3.1 of the specification. */
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

/**
 * The leadership group complements membership, it does not replace it:
 * leadership only grants full rights together with the member group.
 */
export function resolveViewerLevel(
  groups: ReadonlyArray<string>,
  config: OobConfig['authentik'],
): ViewerLevel {
  const has = (groupName: string): boolean => groups.includes(groupName)
  if (has(config.groups.tag) && has(config.groups.vezetoseg)) {
    return 'leadership'
  }
  if (has(config.groups.tag)) {
    return 'member'
  }
  if (has(config.groups.schonherz)) {
    return 'schonherz'
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
