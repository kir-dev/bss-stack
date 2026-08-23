import { and, eq } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { siteSettings, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { writeAudit } from '#/server/shared/write.ts'

/**
 * Kiemelés (spec 9.2): csak publikált, publikus videó emelhető ki; a
 * kiemelés nem időzíthető. Az érvénytelenedést a BSS-014 életciklus kezeli
 * ugyanabban a tranzakcióban.
 */
export async function setHighlightedVideo(
  executor: Executor,
  params: {
    viewer: Viewer
    videoId: string | null
    clock?: Clock
  },
): Promise<void> {
  if (!can.manageHomepageSettings(params.viewer)) {
    throw new ForbiddenError('A kiemelés kezelése vezetőségi jog.')
  }

  await executor.transaction(async (tx) => {
    if (params.videoId !== null) {
      const rows = await tx
        .select({ id: videos.id })
        .from(videos)
        .where(
          and(
            eq(videos.id, params.videoId),
            eq(videos.status, 'published'),
            eq(videos.visibility, 'public'),
          ),
        )
        .limit(1)
      if (rows.length === 0) {
        throw new Error('Csak publikált, publikus videó emelhető ki.')
      }
    }

    const beforeRows = await tx
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, 0))
      .limit(1)
    const before = beforeRows.at(0)?.highlightedVideoId ?? null
    const now = (params.clock ?? systemClock).now()

    await tx
      .insert(siteSettings)
      .values({ id: 0, highlightedVideoId: params.videoId, updatedAt: now })
      .onConflictDoUpdate({
        target: siteSettings.id,
        set: { highlightedVideoId: params.videoId, updatedAt: now },
      })

    await writeAudit(tx, {
      actor: params.viewer.sub ?? '',
      entityType: 'site_settings',
      entityId: 'highlight',
      action: 'update',
      before: { highlightedVideoId: before },
      after: { highlightedVideoId: params.videoId },
      occurredAt: now,
    })
  })
}

export async function getHighlightedVideoId(
  executor: Executor,
): Promise<string | null> {
  const rows = await executor
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, 0))
    .limit(1)
  return rows.at(0)?.highlightedVideoId ?? null
}
