import { lte, eq } from 'drizzle-orm'
import { videos, slugHistory } from '#/db/schema.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { SYSTEM_ACTOR, writeAudit } from '#/server/shared/write.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import type { JobDefinition } from '#/server/jobs/runner.ts'

export const TRASH_RETENTION_DAYS = 30
export const TRASH_PURGE_JOB_NAME = 'video-trash-purge-daily'

/**
 * Daily permanent deletion (spec 13.1): the record of videos that have been in
 * the trash for at least 30 days is deleted; external media files are not
 * touched. The slug goes into the history (reuse forbidden), and the deletion
 * gets a full audit entry.
 */
export async function purgeExpiredTrashedVideos(
  executor: Executor,
  options: { now?: Date; retentionDays?: number } = {},
): Promise<string[]> {
  const now = options.now ?? systemClock.now()
  const retentionMs =
    (options.retentionDays ?? TRASH_RETENTION_DAYS) * 86_400_000
  const cutoff = new Date(now.getTime() - retentionMs)

  const candidates = await executor
    .select({ id: videos.id })
    .from(videos)
    .where(lte(videos.trashedAt, cutoff))

  const purgedIds: string[] = []
  for (const candidate of candidates) {
    const deleted = await executor.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(videos)
        .where(eq(videos.id, candidate.id))
        .for('update')
        .limit(1)
      const row = rows.at(0)
      if (
        row === undefined ||
        row.status !== 'trash' ||
        row.trashedAt === null
      ) {
        return null
      }
      if (row.trashedAt.getTime() > now.getTime() - retentionMs) {
        return null
      }

      await tx.insert(slugHistory).values({
        entityType: 'video',
        slug: row.slug,
        entityId: row.id,
        createdAt: now,
      })
      await tx.delete(videos).where(eq(videos.id, row.id))

      await writeAudit(tx, {
        actor: SYSTEM_ACTOR,
        entityType: 'video',
        entityId: row.id,
        action: 'delete_permanent',
        before: {
          slug: row.slug,
          title: row.title,
          status: row.status,
          trashedAt: row.trashedAt.toISOString(),
        },
        after: null,
        occurredAt: now,
      })
      return row.id
    })
    if (deleted !== null) {
      purgedIds.push(deleted)
    }
  }
  return purgedIds
}

/** Register the daily job into the background runner (extra job of the BSS-010 runner). */
export function createTrashPurgeJob(deps: {
  clock?: Clock
  db: () => Promise<Executor>
}): JobDefinition {
  return {
    name: TRASH_PURGE_JOB_NAME,
    intervalMs: 24 * 60 * 60 * 1000,
    run: async () => {
      const executor = await deps.db()
      await purgeExpiredTrashedVideos(executor, {
        now: (deps.clock ?? systemClock).now(),
      })
    },
  }
}
