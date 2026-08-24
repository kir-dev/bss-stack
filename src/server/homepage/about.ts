import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { aboutPageVideos, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { writeAudit } from '#/server/shared/write.ts'

export const ABOUT_VIDEO_LIMIT = 6

/**
 * Set the About page video list (spec 10.1): at most six public videos,
 * chosen and ordered by leadership.
 */
export async function setAboutVideos(
  executor: Executor,
  params: {
    viewer: Viewer
    orderedVideoIds: readonly string[]
    clock?: Clock
  },
): Promise<void> {
  if (!can.manageHomepageSettings(params.viewer)) {
    throw new ForbiddenError('A Rólunk-videók kezelése vezetőségi jog.')
  }
  if (params.orderedVideoIds.length > ABOUT_VIDEO_LIMIT) {
    throw new Error(
      `Legfeljebb ${ABOUT_VIDEO_LIMIT} videó helyezhető a Rólunk oldalra.`,
    )
  }
  const ids = [...new Set(params.orderedVideoIds)]
  if (ids.length !== params.orderedVideoIds.length) {
    throw new Error('Duplikált videó nem szerepelhet a Rólunk-listában.')
  }

  await executor.transaction(async (tx) => {
    for (const videoId of ids) {
      const rows = await tx
        .select({ id: videos.id })
        .from(videos)
        .where(
          and(
            eq(videos.id, videoId),
            eq(videos.status, 'published'),
            eq(videos.visibility, 'public'),
          ),
        )
        .limit(1)
      if (rows.length === 0) {
        throw new Error(
          'Csak publikált, publikus videó helyezhető a Rólunk oldalra.',
        )
      }
    }

    const beforeRows = await tx
      .select({
        videoId: aboutPageVideos.videoId,
        position: aboutPageVideos.position,
      })
      .from(aboutPageVideos)
      .orderBy(asc(aboutPageVideos.position))
    const beforeIds = beforeRows.map((row) => row.videoId)

    await tx.delete(aboutPageVideos)
    for (const [index, videoId] of ids.entries()) {
      await tx.insert(aboutPageVideos).values({ position: index + 1, videoId })
    }

    await writeAudit(tx, {
      actor: params.viewer.sub ?? '',
      entityType: 'about_page',
      entityId: 'videos',
      action: 'update',
      before: { videoIds: beforeIds },
      after: { videoIds: ids },
      occurredAt: (params.clock ?? systemClock).now(),
    })
  })
}

/**
 * About page videos: archived, trashed or unpublished videos automatically
 * drop out of the list (SQL-level filtering).
 */
export async function getAboutPageVideos(
  executor: Executor,
): Promise<Array<typeof videos.$inferSelect>> {
  return executor
    .select({ ...getTableColumns(videos) })
    .from(aboutPageVideos)
    .innerJoin(
      videos,
      and(
        eq(videos.id, aboutPageVideos.videoId),
        eq(videos.status, 'published'),
        eq(videos.visibility, 'public'),
      ),
    )
    .orderBy(asc(aboutPageVideos.position))
}
