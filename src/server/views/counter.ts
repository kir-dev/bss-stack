import { randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import { isMember } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { canSeeVideo } from '#/server/videos/visibility.ts'
import { hashSessionToken } from '#/server/auth/session-cookies.ts'
import type { CookieSpec } from '#/server/auth/session-cookies.ts'
import { videos, viewSessions } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { systemClock } from '#/lib/clock.ts'
import type { Clock } from '#/lib/clock.ts'

export const VIEW_SESSION_COOKIE_NAME = 'bss_view_session'

/**
 * Generate a new anonymous view-session token. The token is in the cookie,
 * the database only stores its SHA-256 hash (the same pattern as for the
 * auth session) — IP and user history are never stored.
 */
export function newViewSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Cookie valid until the browser is closed (spec 5.5): deliberately there is
 * NO Max-Age, so a non-persistent session cookie is created.
 */
export function viewSessionCookieSpec(
  token: string,
  secure = false,
): CookieSpec {
  return { name: VIEW_SESSION_COOKIE_NAME, value: token, secure }
}

export interface ViewRecordResult {
  /** The (hashed) session identifier stored in the database. */
  sessionId: string
  counted: boolean
}

/**
 * Record a video view. A browser session counts the same video only once:
 * `view_sessions` primary key + ON CONFLICT DO NOTHING provide idempotency,
 * even against parallel requests. Only a published video visible to the
 * viewer can be counted.
 */
export async function recordVideoView(
  executor: Executor,
  params: {
    videoId: string
    viewer: Viewer
    /** The client's existing view-session token, or null (first play). */
    token: string | null
    clock?: Clock
  },
): Promise<ViewRecordResult> {
  const videoRows = await executor
    .select({
      id: videos.id,
      status: videos.status,
      visibility: videos.visibility,
    })
    .from(videos)
    .where(eq(videos.id, params.videoId))
    .limit(1)
  const video = videoRows.at(0)
  if (
    video === undefined ||
    video.status !== 'published' ||
    !canSeeVideo(params.viewer, video.visibility)
  ) {
    throw new Error('A videó nem érhető el ebben a nézetben.')
  }

  let token = params.token
  if (token === null || token === '') {
    token = newViewSessionToken()
  }
  const sessionId = hashSessionToken(token)

  return executor.transaction(async (tx) => {
    const inserted = await tx
      .insert(viewSessions)
      .values({
        videoId: params.videoId,
        sessionId,
        viewedAt: (params.clock ?? systemClock).now(),
      })
      .onConflictDoNothing()
      .returning({ sessionId: viewSessions.sessionId })

    if (inserted.length > 0) {
      await tx
        .update(videos)
        .set({ viewCount: sql`${videos.viewCount} + 1` })
        .where(eq(videos.id, params.videoId))
    }

    return { sessionId, counted: inserted.length > 0 }
  })
}

/**
 * Query the view count: it may only appear in an admin response (spec 5.5),
 * therefore at least membership is required.
 */
export async function getViewCount(
  executor: Executor,
  viewer: Viewer,
  videoId: string,
): Promise<number> {
  if (!isMember(viewer)) {
    throw new ForbiddenError('A megtekintésszám csak adminfelületen látható.')
  }
  const rows = await executor
    .select({ viewCount: videos.viewCount })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)
  return rows.at(0)?.viewCount ?? 0
}
