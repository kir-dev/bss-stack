import { eq } from 'drizzle-orm'
import { aboutPageVideos, siteSettings } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

/**
 * Homepage-hivatkozások érvénytelenítése (spec 9.2, 10.1): ha a videó már nem
 * publikált és publikus (archiválás, lomtár, láthatóság-szűkítés), akkor a
 * kiemelésből és a Rólunk-listából ugyanebben a tranzakcióban ki kell kerülnie.
 */
export async function invalidateHomepageReferences(
  executor: Executor,
  videoId: string,
): Promise<void> {
  await executor
    .update(siteSettings)
    .set({ highlightedVideoId: null })
    .where(eq(siteSettings.highlightedVideoId, videoId))
  await executor
    .delete(aboutPageVideos)
    .where(eq(aboutPageVideos.videoId, videoId))
}
