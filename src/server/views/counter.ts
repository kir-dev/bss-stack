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
 * Anonim megtekintés-session token új generálása. A cookie-ban a token van,
 * az adatbázisban csak az SHA-256 kivonata (ugyanaz a minta, mint az auth
 * session-nél) — IP és felhasználói előzmény soha nem tárolódik.
 */
export function newViewSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Böngésző bezárásáig élő cookie (spec 5.5): szándékosan NINCS Max-Age,
 * így nem perzisztens session-cookie keletkezik.
 */
export function viewSessionCookieSpec(
  token: string,
  secure = false,
): CookieSpec {
  return { name: VIEW_SESSION_COOKIE_NAME, value: token, secure }
}

export interface ViewRecordResult {
  /** Az adatbázisban tárolt (kivonatolt) session-azonosító. */
  sessionId: string
  counted: boolean
}

/**
 * Egy videó-megtekintés rögzítése. Egy böngésző-session ugyanazt a videót
 * egyszer számolja: `view_sessions` elsődleges kulcs + ON CONFLICT DO NOTHING
 * ad idempotenciát, párhuzamos kérésekkel szemben is. Csak publikált,
 * a néző számára látható videó számolható.
 */
export async function recordVideoView(
  executor: Executor,
  params: {
    videoId: string
    viewer: Viewer
    /** A kliens meglévő view-session tokenje vagy null (első play). */
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
 * Megtekintésszám lekérdezése: csak adminválaszban jelenhet meg (spec 5.5),
 * ezért legalább tagság kell hozzá.
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
