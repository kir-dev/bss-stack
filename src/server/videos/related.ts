import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { can } from '#/server/auth/policy.ts'
import { relatedVideos, videoTags, videos } from '#/db/schema.ts'
import { visibleVideoCondition } from './visibility.ts'
import {
  EntityNotFoundError,
  StaleWriteError,
  writeAudit,
} from '#/server/shared/write.ts'
import { TextValidationError } from '#/server/shared/text.ts'
import { systemClock } from '#/lib/clock.ts'
import type { Clock } from '#/lib/clock.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

export const RELATED_VIDEO_LIMIT = 5

/**
 * Kapcsolódó videók kiszolgálása (spec 5.6). A kiválasztás sorrendje:
 * 1. sorrendezett manuális lista, ha van;
 * 2. azonos esemény öt legutóbb publikált videója;
 * 3. esemény nélkül a legalább egy közös címkével rendelkező öt legjobb videó,
 *    több közös címke erősebb, egyezésnél `publishedAt` csökkenő dönt.
 * A megjelenítés minden esetben a néző jogosultsága szerint szűr az SQL-ben.
 */
export async function getRelatedVideos(
  executor: Executor,
  viewer: Viewer,
  videoId: string,
): Promise<Array<typeof videos.$inferSelect>> {
  const currentRows = await executor
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)
  const current = currentRows.at(0)
  if (current === undefined) {
    throw new EntityNotFoundError('video', videoId)
  }

  const manual = await executor
    .select({ video: videos })
    .from(relatedVideos)
    .innerJoin(videos, eq(videos.id, relatedVideos.relatedVideoId))
    .where(
      and(
        eq(relatedVideos.videoId, videoId),
        eq(videos.status, 'published'),
        visibleVideoCondition(viewer),
      ),
    )
    .orderBy(asc(relatedVideos.position))
  if (manual.length > 0) {
    return manual.map((row) => row.video)
  }

  if (current.eventId !== null) {
    const sameEvent = await executor
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.status, 'published'),
          eq(videos.eventId, current.eventId),
          ne(videos.id, videoId),
          visibleVideoCondition(viewer),
        ),
      )
      .orderBy(desc(videos.publishedAt), desc(videos.id))
      .limit(RELATED_VIDEO_LIMIT)
    return sameEvent
  }

  const currentTagRows = await executor
    .select({ tagId: videoTags.tagId })
    .from(videoTags)
    .where(eq(videoTags.videoId, videoId))
  const tagIds = currentTagRows.map((row) => row.tagId)
  if (tagIds.length === 0) {
    return []
  }

  const sharedTagScored = await executor
    .select({
      video: videos,
      commonCount: sql<number>`count(*)::int`,
    })
    .from(videos)
    .innerJoin(videoTags, eq(videoTags.videoId, videos.id))
    .where(
      and(
        inArray(videoTags.tagId, tagIds),
        eq(videos.status, 'published'),
        ne(videos.id, videoId),
        visibleVideoCondition(viewer),
      ),
    )
    .groupBy(videos.id)
    .orderBy(sql`count(*) desc`, desc(videos.publishedAt), desc(videos.id))
    .limit(RELATED_VIDEO_LIMIT)
  return sharedTagScored.map((row) => row.video)
}

/**
 * Manuális kapcsolódó lista cseréje. Csak publikált videó választható,
 * láthatóságtól függetlenül; önhivatkozás és duplikáció tiltva.
 */
export async function setManualRelatedVideos(
  executor: Executor,
  params: {
    viewer: Viewer
    videoId: string
    expectedVersion: number
    relatedVideoIds: readonly string[]
    clock?: Clock
  },
): Promise<{ version: number }> {
  if (!can.createOrEditContent(params.viewer)) {
    throw new ForbiddenError(
      'A kapcsolódó videók kezelése csak bejelentkezett BSS-tagnek engedélyezett.',
    )
  }

  return executor.transaction(async (tx) => {
    const lockedRows = await tx
      .select()
      .from(videos)
      .where(eq(videos.id, params.videoId))
      .for('update')
      .limit(1)
    if (lockedRows.length === 0) {
      throw new EntityNotFoundError('video', params.videoId)
    }
    const locked = lockedRows.at(0)
    if (locked === undefined || locked.version !== params.expectedVersion) {
      throw new StaleWriteError('videó')
    }

    const ids = [...new Set(params.relatedVideoIds)]
    if (ids.length !== params.relatedVideoIds.length) {
      throw new TextValidationError([
        'Duplikált kapcsolódó videó nem engedélyezett.',
      ])
    }
    if (ids.includes(params.videoId)) {
      throw new TextValidationError(['A videó önmaga nem lehet kapcsolódó.'])
    }
    if (ids.length > 0) {
      const candidates = await tx
        .select({ id: videos.id, status: videos.status })
        .from(videos)
        .where(inArray(videos.id, ids))
      const foundById = new Map(candidates.map((row) => [row.id, row]))
      for (const id of ids) {
        const candidate = foundById.get(id)
        if (candidate === undefined || candidate.status !== 'published') {
          throw new TextValidationError([
            'Csak publikált videó választható kapcsolódóként.',
          ])
        }
      }
    }

    const beforeList = (
      await tx
        .select({ id: relatedVideos.relatedVideoId })
        .from(relatedVideos)
        .where(eq(relatedVideos.videoId, params.videoId))
        .orderBy(asc(relatedVideos.position))
    ).map((row) => row.id)

    await tx
      .delete(relatedVideos)
      .where(eq(relatedVideos.videoId, params.videoId))
    for (const [index, relatedId] of ids.entries()) {
      await tx.insert(relatedVideos).values({
        videoId: params.videoId,
        relatedVideoId: relatedId,
        position: index + 1,
      })
    }

    const nextVersion = locked.version + 1
    const now = (params.clock ?? systemClock).now()
    await tx
      .update(videos)
      .set({
        version: nextVersion,
        updatedAt: now,
        updatedBy: params.viewer.sub,
      })
      .where(eq(videos.id, params.videoId))

    await writeAudit(tx, {
      actor: params.viewer.sub ?? '',
      entityType: 'video',
      entityId: params.videoId,
      action: 'assign_related',
      before: { relatedVideoIds: beforeList },
      after: { relatedVideoIds: ids },
      occurredAt: now,
    })
    return { version: nextVersion }
  })
}
