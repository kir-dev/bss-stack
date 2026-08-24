import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  COURSE_REDIRECT_TARGET,
  isCoursesPath,
} from '#/server/pages/courses-redirect.ts'
import { getAboutPageVideos } from '#/server/homepage/about.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { aboutPageVideos, memberCache, videos } from '#/db/schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

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
const leaderViewer: Viewer = {
  level: 'leadership',
  sub: 'leader-sub',
  username: 'vezetoseg',
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_about')
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

describe.skipIf(!hasTestDatabase)('BSS-026: tanfolyam átirányítás', () => {
  it('a /courses és /courses/ is a tanfolyami oldalra mutat', () => {
    expect(isCoursesPath('/courses')).toBe(true)
    expect(isCoursesPath('/courses/')).toBe(true)
    expect(COURSE_REDIRECT_TARGET).toBe('https://tanfolyam.bsstudio.hu/')
    expect(isCoursesPath('/courses/mas')).toBe(false)
    expect(isCoursesPath('/videos')).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-026: Rólunk videók', () => {
  it('csak publikált, publikus videó marad a listában', async () => {
    const db = await setupDb()
    const rows = await db
      .insert(videos)
      .values([
        {
          slug: 'about-ok',
          title: 'Marad',
          status: 'published',
          visibility: 'public',
          publishedAt: new Date('2026-06-01T10:00:00Z'),
        },
        {
          slug: 'about-archived',
          title: 'Kiesik archivált',
          status: 'archived',
          publishedAt: new Date('2026-06-02T10:00:00Z'),
        },
        {
          slug: 'about-bss',
          title: 'Kiesik nem publikus',
          status: 'published',
          visibility: 'bss',
          publishedAt: new Date('2026-06-03T10:00:00Z'),
        },
      ])
      .returning()
    const bySlug = new Map(rows.map((row) => [row.slug, row]))
    const ok = bySlug.get('about-ok')
    void leaderViewer
    if (ok === undefined) throw new Error('seed failed')

    await db
      .insert(aboutPageVideos)
      .values(
        rows.map((row, index) => ({ position: index + 1, videoId: row.id })),
      )

    const pageVideos = await getAboutPageVideos(db)
    expect(pageVideos.map((video) => video.slug)).toEqual(['about-ok'])
  })
})
