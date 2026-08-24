import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { videos } from '#/db/schema.ts'
import { atLeast } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'

/**
 * The SQL condition of video visibility according to the viewer's level.
 * This is the only place where the visibility rule lives: every video query
 * runs inside this condition, so even a forbidden video's metadata cannot
 * end up in a response (search and the list use the same).
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
