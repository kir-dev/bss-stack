import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { videos } from '#/db/schema.ts'
import { atLeast } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'

/**
 * A videóláthatóság SQL-feltétele a néző szintje szerint.
 * Ez az egyetlen hely, ahol a láthatósági szabály él: minden videólekérdezés
 * ennek a feltételnek a belsejében fut, így tiltott videó metaadata sem
 * kerülhet válaszba (a keresés és a lista ugyanezt használja).
 */
export function visibleVideoCondition(viewer: Viewer): SQL {
  if (atLeast(viewer, 'member')) {
    return sql`true`
  }
  if (viewer.level === 'schonherz') {
    return sql`(${videos.visibility} in ('public', 'schonherz'))`
  }
  return sql`(${videos.visibility} = 'public')`
}

export function canSeeVideo(viewer: Viewer, visibility: string): boolean {
  if (atLeast(viewer, 'member')) {
    return true
  }
  if (visibility === 'public') {
    return true
  }
  if (viewer.level === 'schonherz') {
    return visibility === 'schonherz'
  }
  return false
}
