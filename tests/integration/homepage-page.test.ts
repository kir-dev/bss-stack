import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { getHomepagePage } from '#/server/pages/homepage.ts'
import { setHighlightedVideo } from '#/server/homepage/highlight.ts'
import { createLiveSchedule } from '#/server/homepage/live.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { FakeClock } from '#/lib/clock.ts'
import { memberCache, videos } from '#/db/schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'
import { installFetchMock } from '../helpers/http-mock.ts'

const databases: Array<{ drop: () => Promise<void> }> = []
const poolCleanups: Array<() => Promise<void>> = []

afterAll(async () => {
  while (poolCleanups.length > 0) {
    await poolCleanups.pop()!()
  }
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)
const clock = new FakeClock('2026-07-01T12:00:00.000Z')
const leaderViewer: Viewer = {
  level: 'leadership',
  sub: 'leader-sub',
  username: 'vezetoseg',
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_homepagedto')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  await migrated.db.insert(memberCache).values({
    sub: 'leader-sub',
    username: 'vezetoseg',
    fullName: 'Vezetőségi Tag',
    membershipStatus: 'studio_member',
  })
  return migrated.db
}

let sequence = 0

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
): Promise<typeof videos.$inferSelect> {
  sequence += 1
  const rows = await db
    .insert(videos)
    .values({
      slug: `video-${sequence}`,
      title: `Videó ${sequence}`,
      status: 'published',
      visibility: 'public',
      publishedAt: new Date(clock.now().getTime() - sequence * 60_000),
      encodingGroup: '16a9_HD',
      hasHq: true,
      hasLq: true,
      baseFilename: `homepage-${sequence}`,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-024: homepage állapot DTO', () => {
  it('normál és kiemelt állapot hat videóval; kiemelt esetén a hero nem ismétlődik', async () => {
    installFetchMock([])
    const db = await setupDb()
    for (let index = 0; index < 7; index += 1) {
      await seedVideo(db)
    }

    const normal = await getHomepagePage(db, { now: clock.now() })
    expect(normal.priority).toBe('normal')
    expect(normal.hero).toBeNull()
    expect(normal.sideVideos).toHaveLength(6)

    // Kiemelés: az első videó a hero, és nem szerepel az oldalalistában.
    const firstVideo = await db
      .select()
      .from(videos)
      .limit(1)
      .then((rows) => rows.at(0))
    if (firstVideo === undefined) throw new Error('seed failed')
    await setHighlightedVideo(db, {
      viewer: leaderViewer,
      videoId: firstVideo.id,
      clock,
    })

    const highlight = await getHomepagePage(db, { now: clock.now() })
    expect(highlight.priority).toBe('highlight')
    expect(highlight.hero?.id).toBe(firstVideo.id)
    expect(highlight.sideVideos.map((video) => video.id)).not.toContain(
      firstVideo.id,
    )
    expect(highlight.sideVideos).toHaveLength(6)
  })

  it('Adás hamarosan sáv csak ütemezett live esetén van', async () => {
    const db = await setupDb()
    installFetchMock([
      {
        method: 'GET',
        urlPattern: /youtube\.com\/oembed/,
        respond: () => ({ status: 200, body: { title: 'Teszt' } }),
      },
    ])
    for (let index = 0; index < 5; index += 1) {
      await seedVideo(db)
    }
    await createLiveSchedule(
      db,
      {
        viewer: leaderViewer,
        clock,
      },
      {
        youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
        startsAt: new Date(clock.now().getTime() + 2 * 60 * 60 * 1000),
        endsAt: new Date(clock.now().getTime() + 4 * 60 * 60 * 1000),
      },
    )

    const state = await getHomepagePage(db, { now: clock.now() })
    expect(state.priority).toBe('normal')
    expect(state.hero).toBeNull()
    expect(state.sideVideos).toHaveLength(5)
    expect(state.upcomingLive).not.toBeNull()
    if (state.upcomingLive === null) throw new Error('unreachable')
    expect(new Date(state.upcomingLive.startsAtIso).getTime()).toBeGreaterThan(
      clock.now().getTime(),
    )

    // Aktív live esetén már nincs "hamarosan" sáv és nincs hero.
    await db.execute(
      `update live_streams
       set status = 'active',
           activated_at = now(),
           starts_at = '${clock.now().toISOString()}',
           ends_at = '${new Date(clock.now().getTime() + 60 * 60 * 1000).toISOString()}'
       where status = 'scheduled'`,
    )
    const liveState = await getHomepagePage(db, { now: clock.now() })
    expect(liveState.priority).toBe('live')
    expect(liveState.liveEmbedUrl).toContain('youtube-nocookie.com')
    expect(liveState.hero).toBeNull()
    expect(liveState.upcomingLive).toBeNull()
    expect(liveState.sideVideos).toHaveLength(5)
  })
})
