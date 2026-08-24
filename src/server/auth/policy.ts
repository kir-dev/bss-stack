import { atLeast } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'

/**
 * Admin permission matrix based on chapter 3.2 of the specification.
 * Leadership rights include member rights: the leadership level
 * satisfies every member capability.
 */

export function isMember(viewer: Viewer): boolean {
  return atLeast(viewer, 'member')
}

export function isLeadership(viewer: Viewer): boolean {
  return atLeast(viewer, 'leadership')
}

export const can = {
  createOrEditContent(viewer: Viewer): boolean {
    return isMember(viewer)
  },
  archiveContent(viewer: Viewer): boolean {
    return isMember(viewer)
  },
  trashVideo(viewer: Viewer): boolean {
    return isMember(viewer)
  },
  viewTrash(viewer: Viewer): boolean {
    return isMember(viewer)
  },
  restoreVideo(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
  permanentlyDeleteEvent(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
  assignExistingTagToVideo(viewer: Viewer): boolean {
    return isMember(viewer)
  },
  manageTagCatalog(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
  manageStaffRoles(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
  manageVideoStaffList(viewer: Viewer): boolean {
    return isMember(viewer)
  },
  manageHomepageSettings(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
  viewMemberDiagnostics(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
  viewAuditLog(viewer: Viewer): boolean {
    return isLeadership(viewer)
  },
} as const

/** Any part of the admin area requires at least membership. */
export function isAdminAreaAllowed(viewer: Viewer): boolean {
  return isMember(viewer)
}
