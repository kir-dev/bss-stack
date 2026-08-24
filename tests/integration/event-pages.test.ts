import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { getEventDetail, getEventListPage } from '#/server/pages/event-list.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import {
  events,
  memberCache,
  staffRoles,
  videoStaff,
  videos,
} from '#/db/schema.ts'
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
const anonymous = anonymousViewer()
const schonherzViewer: Viewer = {
  level: 'schonherz',
  sub: null,
  username: null,
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_eventlist')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert>,
): Promise<typeof videos.$inferSelect> {
  const rows = await db
    .insert(videos)
    .values({
      slug: overrides.slug ?? `video-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? 'Videó',
      status: 'published',
      visibility: 'public',
      publishedAt: new Date('2026-06-01T10:00:00.000Z'),
      thumbnailUrl: 'https://v.bsstudio.hu/t.jpg',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

async function seedEvent(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof events.$inferInsert> & { slug: string },
): Promise<typeof events.$inferSelect> {
  const rows = await db
    .insert(events)
    .values({
      title: overrides.slug,
      startDate: '2026-05-01',
      status: 'published',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-022: eseménylista', () => {
  it('kezdődátum szerint csökkenő, csak publikált; videószám és thumbnail fallback', async () => {
    const db = await setupDb()
    const newer = await seedEvent(db, {
      slug: 'uj-adam',
      startDate: '2026-05-10',
    })
    const older = await seedEvent(db, {
      slug: 'regi-adas',
      startDate: '2025-04-01',
    })
    await seedEvent(db, {
      slug: 'piszkozat-esemeny',
      status: 'draft',
      startDate: null,
    })

    // A régebbi eseménynek nincs saját thumbnailje: fallback a legfrissebb látható videóról.
    await seedVideo(db, { slug: 'fallback-video', eventId: older.id })
    // A névtelen számára nem látható videó nem számol bele.
    await seedVideo(db, {
      slug: 'rejtett',
      visibility: 'bss',
      eventId: newer.id,
    })
    await seedVideo(db, { slug: 'lathato', eventId: newer.id })

    const result = await getEventListPage(db, anonymous)
    expect(result.items.map((item) => item.slug)).toEqual([
      'uj-adam',
      'regi-adas',
    ])
    expect(result.items[0]).toMatchObject({
      visibleVideoCount: 1,
      thumbnailUrl: 'https://v.bsstudio.hu/t.jpg',
    })
    expect(result.items[1]?.visibleVideoCount).toBe(1)

    const schonherzResult = await getEventListPage(db, schonherzViewer)
    expect(schonherzResult.items[0]?.visibleVideoCount).toBe(1)
  })

  it('videó nélküli esemény is megjelenik nulla számmal', async () => {
    const db = await setupDb()
    await seedEvent(db, { slug: 'ures-esemeny' })
    const result = await getEventListPage(db, anonymous)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      visibleVideoCount: 0,
      thumbnailUrl: null,
    })
  })

  it('lapozás működik', async () => {
    const db = await setupDb()
    for (let index = 0; index < 12; index += 1) {
      await seedEvent(db, {
        slug: `esemeny-${String(index).padStart(2, '0')}`,
        startDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
      })
    }
    const first = await getEventListPage(db, anonymous, {
      perPage: 10,
      page: 1,
    })
    const second = await getEventListPage(db, anonymous, {
      perPage: 10,
      page: 2,
    })
    expect(first.total).toBe(12)
    expect(first.items).toHaveLength(10)
    expect(second.items).toHaveLength(2)
    const ids = [
      ...first.items.map((item) => item.id),
      ...second.items.map((item) => item.id),
    ]
    expect(new Set(ids).size).toBe(12)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-022: eseményrészlet', () => {
  it('recordedAt csökkenő sorrend, hiányzó dátum hátul; piszkozat videó nem jelenik meg', async () => {
    const db = await setupDb()
    const event = await seedEvent(db, { slug: 'részlet-adas' })
    await seedVideo(db, {
      slug: 'nincs-datumum',
      eventId: event.id,
      recordedAt: null,
    })
    await seedVideo(db, {
      slug: 'regi',
      eventId: event.id,
      recordedAt: '2026-05-01',
    })
    await seedVideo(db, {
      slug: 'uj',
      eventId: event.id,
      recordedAt: '2026-05-03',
    })
    await seedVideo(db, {
      slug: 'piszkozat-video',
      eventId: event.id,
      status: 'draft',
    })

    const detail = await getEventDetail(db, anonymous, 'részlet-adas')
    expect(detail?.videos.total).toBe(3)
    expect(detail?.videos.items.map((video) => video.slug)).toEqual([
      'uj',
      'regi',
      'nincs-datumum',
    ])
  })

  it('stáblista csak látható videókból, titulus nélkül, név szerint rendezve', async () => {
    const db = await setupDb()
    await db.insert(memberCache).values([
      {
        sub: 'sub-a',
        username: 'anna',
        fullName: 'Anna Tag',
        membershipStatus: 'studio_member',
      },
      {
        sub: 'sub-b',
        username: 'bence',
        fullName: 'Bence Tag',
        membershipStatus: 'studio_member',
      },
    ])
    const roleRows = await db
      .insert(staffRoles)
      .values([{ name: 'Vágó', normalizedName: 'vago', displayOrder: 1 }])
      .returning()
    const role = roleRows.at(0)
    if (role === undefined) throw new Error('seed failed')
    const event = await seedEvent(db, { slug: 'stabos-adas' })
    const publicVideo = await seedVideo(db, {
      slug: 'publikus-v',
      eventId: event.id,
    })
    const secretVideo = await seedVideo(db, {
      slug: 'titkos-v',
      visibility: 'bss',
      eventId: event.id,
    })
    await db.insert(videoStaff).values([
      { videoId: publicVideo.id, roleId: role.id, memberSub: 'sub-b' },
      { videoId: publicVideo.id, roleId: role.id, memberSub: 'sub-a' },
      { videoId: secretVideo.id, roleId: role.id, memberSub: 'sub-a' },
    ])

    const detail = await getEventDetail(db, anonymous, 'stabos-adas')
    expect(detail?.staffMembers.map((member) => member.fullName)).toEqual([
      'Anna Tag',
      'Bence Tag',
    ])

    void event
  })

  it('piszkozat vagy ismeretlen esemény null (404)', async () => {
    const db = await setupDb()
    await seedEvent(db, { slug: 'draft-esemeny', status: 'draft' })
    expect(await getEventDetail(db, anonymous, 'draft-esemeny')).toBeNull()
    expect(await getEventDetail(db, anonymous, 'nincs-ilyen')).toBeNull()
  })
})
