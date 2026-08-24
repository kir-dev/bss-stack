import { eq } from 'drizzle-orm'
import { aboutPageVideos, siteSettings } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

/**
 * Invalidate homepage references (spec 9.2, 10.1): if the video is no longer
 * published and public (archiving, trash, visibility narrowing), it must be
 * removed from the highlight and the About list within the same transaction.
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
