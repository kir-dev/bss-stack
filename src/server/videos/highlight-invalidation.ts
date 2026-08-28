import { eq } from 'drizzle-orm'
import { aboutPageVideos, siteSettings } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

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
