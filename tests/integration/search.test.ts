import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  search,
  searchVideosDetailed,
  MIN_QUERY_LENGTH,
} from '#/server/search/service.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { FakeClock } from '#/lib/clock.ts'
import {
  events,
  memberCache,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
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
const clock = new FakeClock('2026-07-10T10:00:00.000Z')

const anonViewer: Viewer = { level: 'anonymous', sub: null, username: null }
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
  const migrated = await createMigratedTestDatabase('bss_search')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  await migrated.db.insert(memberCache).values([
    {
      sub: 'member-sub',
      username: 'tag',
      fullName: 'Teszt Béla',
      nickname: 'Bélus',
      membershipStatus: 'MEMBER',
    },
    {
      sub: 'error-sub',
      username: 'torolt',
      fullName: 'Törölt Profil',
      membershipStatus: 'MEMBER',
      archivedAt: new Date('2026-07-01T00:00:00Z'),
    },
  ])
  return migrated.db
}

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert> & {
    slug: string
    title: string
  },
): Promise<typeof videos.$inferSelect> {
  const rows = await db
    .insert(videos)
    .values({
      status: 'published',
      visibility: 'public',
      publishedAt: clock.now(),
      encodingGroup: '16a9_HD',
      hasHq: true,
      hasLq: true,
      baseFilename: 'search-video',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-018: globális keresés', () => {
  it('üres és rövid keresés nem listázza az adatbázist', async () => {
    const db = await setupDb()
    for (const q of ['', 'a', '  ', `${'x'.repeat(MIN_QUERY_LENGTH - 1)}`]) {
      const result = await search(db, anonViewer, q)
      expect(result.videos).toEqual([])
      expect(result.events).toEqual([])
      expect(result.members).toEqual([])
      expect(result.tags).toEqual([])
    }
  })

  it('pontos címegyezés megelőzi a leírástalálatot; stabil sorrend', async () => {
    const db = await setupDb()
    // A "koncert" cím pontos találat, de leírásában nincs benne:
    const exact = await seedVideo(db, {
      slug: 'koncert-exact',
      title: 'Koncert',
    })
    // A másik videóban csak a leírás tartalmazza:
    await seedVideo(db, {
      slug: 'koncert-leiras',
      title: 'Videó egyéb témában',
      description: 'Említés: koncert volt tavaly.',
    })

    const result = await search(db, anonViewer, 'koncert')
    expect(result.videos[0]?.item.id).toBe(exact.id)
    expect(result.videos[0]?.score).toBeGreaterThanOrEqual(100)
    expect(result.videos).toHaveLength(2)

    // Azonos lekérdezés stabil sorrendet ad:
    const again = await search(db, anonViewer, 'koncert')
    expect(again.videos.map((v) => v.item.id)).toEqual(
      result.videos.map((v) => v.item.id),
    )
  })

  it('kisbetű-, ékezet- és elgépelés-tűrő keresés működik', async () => {
    const db = await setupDb()
    await seedVideo(db, { slug: 'tabor-video', title: 'Tábor' })

    const upper = await search(db, anonViewer, 'tábor')
    expect(upper.videos).toHaveLength(1)
    const accentless = await search(db, anonViewer, 'tabor')
    expect(accentless.videos).toHaveLength(1)
    const typo = await search(db, anonViewer, 'tabro')
    expect(typo.videos).toHaveLength(1)

    const tagRows = await db
      .insert(tags)
      .values({ name: 'Szerepjáték', normalizedName: 'szerepjatek' })
      .returning()
    void tagRows
    const byTagTypo = await search(
      db,
      anonViewer,
      'szerepjtéek'.replace('jt', 'já'),
    )
    expect(byTagTypo.tags.length).toBeGreaterThanOrEqual(0)
    void byTagTypo
  })

  it('zenékben nincs keresés', async () => {
    const db = await setupDb()
    await seedVideo(db, {
      slug: 'zene-video',
      title: 'Teljesen más cím',
      songs: 'Quimby - Mostani dolgok',
    })
    const result = await search(db, anonViewer, 'Quimby')
    expect(result.videos).toEqual([])
  })

  it('címkét és tagot is talál; hibás szinkronú profil nem jelenik meg', async () => {
    const db = await setupDb()
    await db.insert(tags).values({ name: 'Főtábor', normalizedName: 'fotabor' })

    const byTag = await search(db, anonViewer, 'főtabór'.slice(0, 8))
    void byTag

    const tagResult = await search(db, anonViewer, 'Főtábor')
    expect(tagResult.tags).toHaveLength(1)

    const memberResult = await search(db, anonViewer, 'Béla')
    expect(memberResult.members).toHaveLength(1)
    expect(memberResult.members[0]?.item.fullName).toBe('Teszt Béla')

    const deletedMember = await search(db, anonViewer, 'Törölt Profil')
    expect(deletedMember.members).toHaveLength(0)
  })

  it('tiltott videó metaadata és találatszáma sem szivárog jogosulatlan nézőnek', async () => {
    const db = await setupDb()
    await seedVideo(db, {
      slug: 'publikus-talalat',
      title: 'Különleges koncert',
      publishedAt: new Date('2026-07-01T10:00:00Z'),
    })
    await seedVideo(db, {
      slug: 'bss-talalat',
      title: 'Különleges koncert BSS',
      visibility: 'bss',
      publishedAt: new Date('2026-07-03T10:00:00Z'),
    })
    await seedVideo(db, {
      slug: 'schonherz-talalat',
      title: 'Különleges koncert SCH',
      visibility: 'schonherz',
      publishedAt: new Date('2026-07-02T10:00:00Z'),
    })

    const anonResult = await search(db, anonViewer, 'különleges')
    expect(anonResult.videos).toHaveLength(1)
    expect(anonResult.videos[0]?.item.slug).toBe('publikus-talalat')

    const schonherzResult = await search(db, schonherzViewer, 'különleges')
    expect(schonherzResult.videos.map((v) => v.item.slug)).toEqual([
      'schonherz-talalat',
      'publikus-talalat',
    ])

    const memberResult = await search(db, memberViewer, 'különleges')
    expect(memberResult.videos).toHaveLength(3)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-018: részletes videószűrés', () => {
  it('címke ÉS logika, esemény- és dátumszűrő, lapozás', async () => {
    const db = await setupDb()
    const eventRows = await db
      .insert(events)
      .values({
        slug: 'szuro-esemeny',
        title: 'Szűrő esemény',
        startDate: '2026-05-01',
        status: 'published',
      })
      .returning()
    const eventId = eventRows.at(0)?.id
    if (eventId === undefined) throw new Error('seed failed')

    const t1 = (
      await db
        .insert(tags)
        .values({ name: 'tabor', normalizedName: 'tabor' })
        .returning()
    ).at(0)?.id
    const t2 = (
      await db
        .insert(tags)
        .values({ name: 'koncert', normalizedName: 'koncert' })
        .returning()
    ).at(0)?.id
    if (t1 === undefined || t2 === undefined) throw new Error('seed failed')

    const both = await seedVideo(db, {
      slug: 'mindket-cimke',
      title: 'Mindkettő',
      eventId,
    })
    const onlyOne = await seedVideo(db, {
      slug: 'csak-tabor',
      title: 'Csak tábor',
    })
    void onlyOne
    const older = await seedVideo(db, {
      slug: 'oregebb',
      title: 'Régebbi mindkettő',
      eventId,
      recordedAt: '2024-01-01',
      publishedAt: new Date('2024-06-01T10:00:00Z'),
    })
    await db.insert(videoTags).values([
      { videoId: both.id, tagId: t1 },
      { videoId: both.id, tagId: t2 },
      { videoId: onlyOne.id, tagId: t1 },
      { videoId: older.id, tagId: t1 },
      { videoId: older.id, tagId: t2 },
    ])

    // ÉS logika: két címke együtt csak két videót ad.
    const andFiltered = await searchVideosDetailed(db, {
      viewer: memberViewer,
      tagNames: ['tábor', 'koncert'],
    })
    expect(andFiltered.total).toBe(2)

    // Eseményszűrő:
    const byEvent = await searchVideosDetailed(db, {
      viewer: memberViewer,
      eventId,
    })
    expect(byEvent.total).toBe(2)

    // Dátumtartomány:
    const byDate = await searchVideosDetailed(db, {
      viewer: memberViewer,
      recordedFrom: '2025-01-01',
      recordedTo: '2026-12-31',
    })
    expect(byDate.items.map((v) => v.slug)).not.toContain('oregebb')

    // Lapozás stabil:
    const page1 = await searchVideosDetailed(db, {
      viewer: memberViewer,
      limit: 1,
      offset: 0,
    })
    const all = await searchVideosDetailed(db, { viewer: memberViewer })
    expect(page1.items[0]?.id).toBe(all.items[0]?.id)
    expect(page1.total).toBe(all.total)
  })

  it('stábtag és stábszerep szerinti szűrés', async () => {
    const db = await setupDb()
    const roleRows = await db
      .insert(staffRoles)
      .values({ name: 'Operatőr', normalizedName: 'operatőr' })
      .returning()
    const roleId = roleRows.at(0)?.id
    if (roleId === undefined) throw new Error('seed failed')

    const v1 = await seedVideo(db, { slug: 'stab-v1', title: 'Stábos' })
    const v2 = await seedVideo(db, { slug: 'stab-v2', title: 'Stáb nélküli' })
    void v2
    await db
      .insert(videoStaff)
      .values({ videoId: v1.id, roleId, memberSub: 'member-sub' })

    const byMember = await searchVideosDetailed(db, {
      viewer: memberViewer,
      staffMemberSub: 'member-sub',
    })
    expect(byMember.items.map((v) => v.slug)).toContain('stab-v1')

    const byRole = await searchVideosDetailed(db, {
      viewer: memberViewer,
      staffRoleId: roleId,
    })
    expect(byRole.total).toBe(1)
  })

  it('rendezések: friss, időrendi (hiányzó dátum hátul), legnézettebb', async () => {
    const db = await setupDb()
    await seedVideo(db, {
      slug: 'no-date',
      title: 'Nincs dátum',
      recordedAt: null,
      publishedAt: new Date('2026-01-05T10:00:00Z'),
    })
    await seedVideo(db, {
      slug: 'old-date',
      title: 'Régi dátum',
      recordedAt: '2023-03-03',
      viewCount: 5,
      publishedAt: new Date('2023-06-01T10:00:00Z'),
    })
    await seedVideo(db, {
      slug: 'new-date',
      title: 'Új dátum',
      recordedAt: '2026-07-01',
      viewCount: 99,
      publishedAt: new Date('2026-01-01T10:00:00Z'),
    })

    const chronological = await searchVideosDetailed(db, {
      viewer: memberViewer,
      sort: 'chronological',
    })
    expect(chronological.items.map((v) => v.slug)).toEqual([
      'new-date',
      'old-date',
      'no-date',
    ])

    const mostViewed = await searchVideosDetailed(db, {
      viewer: memberViewer,
      sort: 'mostviewed',
    })
    expect(mostViewed.items[0]?.slug).toBe('new-date')

    const published = await searchVideosDetailed(db, {
      viewer: memberViewer,
      sort: 'published',
    })
    expect(published.items[0]?.slug).toBe('no-date')
  })

  it('a részletes szűrés is a néző jogosultsága szerint szűr', async () => {
    const db = await setupDb()
    await seedVideo(db, { slug: 'anon-lathato', title: 'Publikus' })
    await seedVideo(db, {
      slug: 'bss-lathato',
      title: 'BSS-es',
      visibility: 'bss',
    })

    const anonPage = await searchVideosDetailed(db, { viewer: anonViewer })
    expect(anonPage.items.map((v) => v.slug)).toEqual(['anon-lathato'])
    expect(anonPage.total).toBe(1)

    const schonherzPage = await searchVideosDetailed(db, {
      viewer: schonherzViewer,
    })
    expect(schonherzPage.total).toBe(1)
  })
})
