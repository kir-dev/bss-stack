import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import {
  getViewCount,
  newViewSessionToken,
  recordVideoView,
  VIEW_SESSION_COOKIE_NAME,
  viewSessionCookieSpec,
} from '#/server/views/counter.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { serializeSetCookie } from '#/server/auth/session-cookies.ts'
import { FakeClock } from '#/lib/clock.ts'
import { videos, viewSessions } from '#/db/schema.ts'
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
const clock = new FakeClock('2026-06-25T10:00:00.000Z')

const anonViewer = anonymousViewer
const schonherzViewer: Viewer = {
  level: 'schonherz',
  sub: null,
  username: null,
}
const memberViewer: Viewer = {
  level: 'member',
  sub: 'member-sub',
  username: 'tag',
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_views')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert> & { slug: string },
): Promise<typeof videos.$inferSelect> {
  const rows = await db
    .insert(videos)
    .values({
      title: overrides.slug,
      status: 'published',
      publishedAt: clock.now(),
      encodingGroup: '16a9_HD',
      hasHq: true,
      hasLq: true,
      baseFilename: 'counter-video',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-016: megtekintésszámláló', () => {
  it('a session cookie böngésző bezárásáig él — nincs Max-Age', () => {
    const spec = viewSessionCookieSpec(newViewSessionToken())
    expect(spec.name).toBe(VIEW_SESSION_COOKIE_NAME)
    expect(spec.maxAgeSeconds).toBeUndefined()
    const header = serializeSetCookie(spec)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).not.toContain('Max-Age')
  })

  it('első play számol; pause és újraindítás (ugyanaz a token) nem számol újra', async () => {
    const db = await setupDb()
    const video = await seedVideo(db, { slug: 'view-video' })
    const token = newViewSessionToken()

    const first = await recordVideoView(db, {
      videoId: video.id,
      viewer: anonViewer(),
      token,
      clock,
    })
    expect(first.counted).toBe(true)

    // Többszöri play ugyanazzal a sessionnel:
    for (let i = 0; i < 3; i += 1) {
      const repeat = await recordVideoView(db, {
        videoId: video.id,
        viewer: anonViewer(),
        token,
        clock,
      })
      expect(repeat.counted).toBe(false)
    }

    const after = await db
      .select()
      .from(videos)
      .where(eq(videos.id, video.id))
      .limit(1)
    expect(after.at(0)?.viewCount).toBe(1)
    const sessions = await db.select().from(viewSessions)
    expect(sessions).toHaveLength(1)
  })

  it('másik böngésző-session növelheti a számlálót', async () => {
    const db = await setupDb()
    const video = await seedVideo(db, { slug: 'view-two-sessions' })
    await recordVideoView(db, {
      videoId: video.id,
      viewer: anonViewer(),
      token: newViewSessionToken(),
      clock,
    })
    const second = await recordVideoView(db, {
      videoId: video.id,
      viewer: anonViewer(),
      token: newViewSessionToken(),
      clock,
    })
    expect(second.counted).toBe(true)
    const after = await db
      .select()
      .from(videos)
      .where(eq(videos.id, video.id))
      .limit(1)
    expect(after.at(0)?.viewCount).toBe(2)
  })

  it('párhuzamos kérések közül csak az első számol (idempotencia)', async () => {
    const db = await setupDb()
    const video = await seedVideo(db, { slug: 'view-parallel' })
    const token = newViewSessionToken()

    const results = await Promise.all([
      recordVideoView(db, {
        videoId: video.id,
        viewer: anonViewer(),
        token,
        clock,
      }),
      recordVideoView(db, {
        videoId: video.id,
        viewer: anonViewer(),
        token,
        clock,
      }),
    ])
    const countedCount = results.filter((r) => r.counted).length
    expect(countedCount).toBe(1)
    const after = await db
      .select()
      .from(videos)
      .where(eq(videos.id, video.id))
      .limit(1)
    expect(after.at(0)?.viewCount).toBe(1)
  })

  it('nem publikált vagy nem látható videó nem számolható', async () => {
    const db = await setupDb()
    const draft = await seedVideo(db, { slug: 'view-draft', status: 'draft' })
    await expect(
      recordVideoView(db, {
        videoId: draft.id,
        viewer: memberViewer,
        token: null,
        clock,
      }),
    ).rejects.toThrow(/nem érhető el/)

    const bssOnly = await seedVideo(db, { slug: 'view-bss', visibility: 'bss' })
    await expect(
      recordVideoView(db, {
        videoId: bssOnly.id,
        viewer: schonherzViewer,
        token: null,
        clock,
      }),
    ).rejects.toThrow(/nem érhető el/)
  })

  it('IP és felhasználói előzmény nem tárolódik — csak kivonatolt session azonosító', async () => {
    const db = await setupDb()
    const video = await seedVideo(db, { slug: 'view-no-ip' })
    const result = await recordVideoView(db, {
      videoId: video.id,
      viewer: anonViewer(),
      token: null,
      clock,
    })
    expect(result.sessionId).toMatch(/^[0-9a-f]{64}$/)
    const sessions = await db.select().from(viewSessions)
    expect(sessions.at(0)?.sessionId).toBe(result.sessionId)
  })

  it('a megtekintésszám csak adminválaszban kérdezhető le', async () => {
    const db = await setupDb()
    const video = await seedVideo(db, { slug: 'view-admin' })
    await recordVideoView(db, {
      videoId: video.id,
      viewer: anonViewer(),
      token: null,
      clock,
    })

    await expect(
      getViewCount(db, anonymousViewer(), video.id),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      getViewCount(db, schonherzViewer, video.id),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(getViewCount(db, memberViewer, video.id)).resolves.toBe(1)
  })
})
