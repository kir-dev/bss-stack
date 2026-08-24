import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  getVideoFilterOptions,
  getVideoListPage,
  parseVideoListSearch,
} from '#/server/pages/video-list.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import {
  events,
  memberCache,
  tags,
  videos,
  videoStaff,
  staffRoles,
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
  const migrated = await createMigratedTestDatabase('bss_videolist')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

let sequence = 0

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert>,
): Promise<typeof videos.$inferSelect> {
  sequence += 1
  const rows = await db
    .insert(videos)
    .values({
      slug: `video-${sequence}`,
      title: `Videó ${sequence}`,
      status: 'published',
      visibility: 'public',
      publishedAt: new Date(
        `2026-01-${String((sequence % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      ),
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-020: videólista URL-értelmezés', () => {
  it('alapértékek: published rendezés, 50-es oldalméret, 1. oldal', () => {
    expect(parseVideoListSearch({})).toMatchObject({
      sort: 'published',
      perPage: 50,
      page: 1,
      q: '',
      tagNames: [],
    })
  })

  it('ismeretlen rendezés és oldalméret az alapértelmezésre esik vissza', () => {
    const parsed = parseVideoListSearch({
      sort: 'hacker',
      perPage: '9999',
      page: '-3',
    })
    expect(parsed.sort).toBe('published')
    expect(parsed.perPage).toBe(50)
    expect(parsed.page).toBe(1)
  })

  it('érvényes értékeket átenged; dátum csak ISO formában', () => {
    const parsed = parseVideoListSearch({
      sort: 'chronological',
      perPage: '10',
      page: '3',
      q: '  bstv  ',
      tags: ['a', ' b '],
      from: '2026-01-02',
      to: 'not-a-date',
    })
    expect(parsed).toMatchObject({
      sort: 'chronological',
      perPage: 10,
      page: 3,
      q: 'bstv',
      tagNames: ['a', 'b'],
      recordedFrom: '2026-01-02',
      recordedTo: '',
    })
  })
})

describe.skipIf(!hasTestDatabase)('BSS-020: videólista lekérdezés', () => {
  it('lapozás duplikáció és kihagyás nélkül', async () => {
    const db = await setupDb()
    for (let index = 0; index < 12; index += 1) {
      await seedVideo(db, {})
    }
    const query = parseVideoListSearch({ perPage: '10' })
    const first = await getVideoListPage(db, anonymous, { ...query, page: 1 })
    const second = await getVideoListPage(db, anonymous, { ...query, page: 2 })
    expect(first.total).toBe(12)
    expect(first.items).toHaveLength(10)
    expect(second.items).toHaveLength(2)
    expect(first.totalPages).toBe(2)
    const ids = [
      ...first.items.map((item) => item.id),
      ...second.items.map((item) => item.id),
    ]
    expect(new Set(ids).size).toBe(12)
  })

  it('névtelen néző nem lát korlátozott videót, schönherzes a schönherzeset sem', async () => {
    const db = await setupDb()
    await seedVideo(db, {})
    await seedVideo(db, { visibility: 'schonherz' })
    await seedVideo(db, { visibility: 'bss' })

    const anonymousResult = await getVideoListPage(
      db,
      anonymous,
      parseVideoListSearch({ perPage: '100' }),
    )
    expect(anonymousResult.total).toBe(1)

    const schonherzResult = await getVideoListPage(
      db,
      schonherzViewer,
      parseVideoListSearch({ perPage: '100' }),
    )
    expect(schonherzResult.total).toBe(2)
  })

  it('ismeretlen esemény slugra üres lista', async () => {
    const db = await setupDb()
    await seedVideo(db, {})
    const result = await getVideoListPage(
      db,
      anonymous,
      parseVideoListSearch({ event: 'nincs-ilyen' }),
    )
    expect(result).toMatchObject({ items: [], total: 0 })
  })

  it('címkék ÉS kapcsolattal szűrnek', async () => {
    const db = await setupDb()
    const tagRows = await db
      .insert(tags)
      .values([
        { name: 'BSTV', normalizedName: 'bstv' },
        { name: 'Interjú', normalizedName: 'interju' },
      ])
      .returning()
    const bstv = tagRows.at(0)
    const interju = tagRows.at(1)
    if (bstv === undefined || interju === undefined)
      throw new Error('seed failed')
    const both = await seedVideo(db, {})
    const onlyOne = await seedVideo(db, {})
    const { videoTags } = await import('#/db/schema.ts')
    await db.insert(videoTags).values([
      { videoId: both.id, tagId: bstv.id },
      { videoId: both.id, tagId: interju.id },
      { videoId: onlyOne.id, tagId: bstv.id },
    ])
    const result = await getVideoListPage(
      db,
      anonymous,
      parseVideoListSearch({ tags: ['bstv', 'interjú'] }),
    )
    expect(result.total).toBe(1)
    expect(result.items.at(0)?.id).toBe(both.id)
  })

  it('szűrőlisták: publikált események, szerepek, stábtagok', async () => {
    const db = await setupDb()
    await db.insert(events).values({
      slug: 'esemeny-a',
      title: 'Esemény A',
      startDate: '2026-05-01',
      status: 'published',
    })
    const roleRows = await db
      .insert(staffRoles)
      .values([{ name: 'Rendező', normalizedName: 'rendezo', displayOrder: 1 }])
      .returning()
    const role = roleRows.at(0)
    if (role === undefined) throw new Error('seed failed')
    const video = await seedVideo(db, {})
    await db.insert(memberCache).values({
      sub: 'staff-sub',
      username: 'stábtag',
      fullName: 'Stáb Tag',
      membershipStatus: 'studio_member',
    })
    await db.insert(videoStaff).values({
      videoId: video.id,
      roleId: role.id,
      memberSub: 'staff-sub',
    })

    const options = await getVideoFilterOptions(db)
    expect(options.events).toEqual([{ slug: 'esemeny-a', title: 'Esemény A' }])
    expect(options.staffMembers).toEqual([
      { sub: 'staff-sub', fullName: 'Stáb Tag' },
    ])
    expect(options.staffRoles).toMatchObject([{ id: role.id, name: 'Rendező' }])
  })
})
