import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  getActiveMemberBlocks,
  getMemberActivity,
  getMemberArchivePage,
  getMemberProfile,
} from '#/server/pages/members.ts'
import { groupActivity } from '#/lib/activity.ts'
import type { ActivityRow } from '#/lib/activity.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { memberCache, staffRoles, videoStaff, videos } from '#/db/schema.ts'
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

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_members')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

async function seedMember(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof memberCache.$inferInsert> & {
    sub: string
    username: string
  },
): Promise<void> {
  await db.insert(memberCache).values({
    fullName: overrides.username,
    membershipStatus: 'studio_member',
    ...overrides,
  })
}

describe.skipIf(!hasTestDatabase)('BSS-023: aktív tagoldal blokkjai', () => {
  it('vezetőség csak a Vezetőség blokkban; törölt profil nem publikus', async () => {
    const db = await setupDb()
    await seedMember(db, {
      sub: 'lead',
      username: 'vezeto',
      fullName: 'Vezető Erika',
      isLeadership: true,
      membershipStatus: 'studio_member',
    })
    await seedMember(db, {
      sub: 'm1',
      username: 'studios',
      fullName: 'Stúdiós Béla',
    })
    await seedMember(db, {
      sub: 'm2',
      username: 'torolt',
      fullName: 'Törölt Henriett',
      membershipStatus: 'studio_member',
      deletedAt: new Date('2026-07-01T00:00:00Z'),
    })
    await seedMember(db, {
      sub: 'm3',
      username: 'jelolt',
      fullName: 'Jelölt Csaba',
      membershipStatus: 'studio_candidate',
    })
    await seedMember(db, {
      sub: 'm4',
      username: 'oregtag',
      fullName: 'Öregtag Dénes',
      membershipStatus: 'senior_active',
    })

    const blocks = await getActiveMemberBlocks(db)
    expect(blocks.leadership.map((member) => member.username)).toEqual([
      'vezeto',
    ])
    // A vezetőségi tag (stúdiós státuszával együtt) nem ismétlődik a stúdiósoknál.
    expect(blocks.studioMembers.map((member) => member.username)).toEqual([
      'studios',
    ])
    expect(blocks.studioCandidates.map((member) => member.username)).toEqual([
      'jelolt',
    ])
    expect(blocks.seniorActive.map((member) => member.username)).toEqual([
      'oregtag',
    ])
  })
})

describe.skipIf(!hasTestDatabase)('BSS-023: archív aloldalak', () => {
  it('archivált öregtagok és közreműködők külön, 50-es lapozással', async () => {
    const db = await setupDb()
    for (let index = 0; index < 3; index += 1) {
      await seedMember(db, {
        sub: `arch-${index}`,
        username: `archivalt-${index}`,
        fullName: `Archivált ${index}`,
        membershipStatus: 'senior_archived',
      })
    }
    await seedMember(db, {
      sub: 'contr-1',
      username: 'kozmukodo',
      fullName: 'Közreműködő Elek',
      membershipStatus: 'contributor',
    })
    await seedMember(db, {
      sub: 'contr-2',
      username: 'kozmukodo-torolt',
      fullName: 'Törölt Közreműködő',
      membershipStatus: 'contributor',
      deletedAt: new Date('2026-07-01T00:00:00Z'),
    })

    const archived = await getMemberArchivePage(db, 'archived')
    expect(archived.total).toBe(3)
    expect(archived.title).toBe('Archivált öregtag')

    const contributors = await getMemberArchivePage(db, 'contributors')
    expect(contributors.items.map((member) => member.username)).toEqual([
      'kozmukodo',
    ])
  })
})

describe.skipIf(!hasTestDatabase)('BSS-023: tagprofil', () => {
  it('profiladatok; törölt tagnak nincs publikus profil', async () => {
    const db = await setupDb()
    await seedMember(db, {
      sub: 'prof-1',
      username: 'profilos',
      fullName: 'Profil Ferenc',
      nickname: 'Profi',
      introduction: 'Szia, Profi vagyok.',
      joinedYear: 2023,
      joinedSemester: 'autumn',
    })
    await seedMember(db, {
      sub: 'prof-2',
      username: 'rejtett',
      fullName: 'Rejtett Gábor',
      deletedAt: new Date('2026-07-01T00:00:00Z'),
    })

    const profile = await getMemberProfile(db, 'profilos')
    expect(profile).toMatchObject({
      fullName: 'Profil Ferenc',
      nickname: 'Profi',
      statusLabel: 'Stúdiós',
      joinedSemester: '2023/2024/1',
      introduction: 'Szia, Profi vagyok.',
    })
    // Email és mobil mező a sémában sincs; a válasz kulcsai ezt tükrözik.
    expect(Object.keys(profile ?? {})).not.toContain('email')
    expect(await getMemberProfile(db, 'rejtett')).toBeNull()
    expect(await getMemberProfile(db, 'nincs-ilyen')).toBeNull()
  })
})

describe.skipIf(!hasTestDatabase)('BSS-023: tevékenység', () => {
  it('csak látható videók, recordedAt csökkenő, több szerep egy sorban', async () => {
    const db = await setupDb()
    await seedMember(db, {
      sub: 'act-1',
      username: 'aktivis',
      fullName: 'Aktív Ilona',
    })
    const roleRows = await db
      .insert(staffRoles)
      .values([
        { name: 'Rendező', normalizedName: 'rendezo', displayOrder: 2 },
        { name: 'Vágó', normalizedName: 'vago', displayOrder: 1 },
      ])
      .returning()
    const rendezo = roleRows.at(0)
    const vago = roleRows.at(1)
    if (rendezo === undefined || vago === undefined)
      throw new Error('seed failed')

    const old = await db
      .insert(videos)
      .values({
        slug: 'regi-video',
        title: 'Régi',
        status: 'published',
        publishedAt: new Date('2024-01-01T10:00:00Z'),
        recordedAt: '2024-01-01',
      })
      .returning()
      .then((rows) => rows.at(0))
    const recent = await db
      .insert(videos)
      .values({
        slug: 'uj-video',
        title: 'Új',
        status: 'published',
        publishedAt: new Date('2026-06-01T10:00:00Z'),
        recordedAt: '2026-06-01',
      })
      .returning()
      .then((rows) => rows.at(0))
    const secret = await db
      .insert(videos)
      .values({
        slug: 'titkos-video',
        title: 'Titkos',
        status: 'published',
        visibility: 'bss',
        publishedAt: new Date('2026-07-01T10:00:00Z'),
        recordedAt: '2026-07-01',
      })
      .returning()
      .then((rows) => rows.at(0))
    if (old === undefined || recent === undefined || secret === undefined) {
      throw new Error('seed failed')
    }

    const staffValues = [
      { videoId: recent.id, roleId: rendezo.id, memberSub: 'act-1' },
      { videoId: recent.id, roleId: vago.id, memberSub: 'act-1' },
      { videoId: old.id, roleId: vago.id, memberSub: 'act-1' },
      { videoId: secret.id, roleId: vago.id, memberSub: 'act-1' },
    ]
    await db.insert(videoStaff).values(staffValues)

    const activity = await getMemberActivity(db, anonymous, 'act-1')
    expect(activity.total).toBe(2)
    expect(activity.items.map((row) => row.slug)).toEqual([
      'uj-video',
      'regi-video',
    ])
    expect(activity.items[0]?.roles.sort()).toEqual(['Rendező', 'Vágó'])

    // Tag néző már a titkos videót is látja.
    const memberViewer: Viewer = {
      level: 'member',
      sub: null,
      username: null,
    }
    const memberActivity = await getMemberActivity(db, memberViewer, 'act-1')
    expect(memberActivity.total).toBe(3)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-023: tevékenység csoportosítás', () => {
  const rows: Array<ActivityRow> = [
    {
      videoId: 'v1',
      slug: 'v1',
      title: 'V1',
      recordedAt: '2026-05-01',
      year: 2026,
      roles: ['Rendező'],
    },
    {
      videoId: 'v2',
      slug: 'v2',
      title: 'V2',
      recordedAt: '2025-03-01',
      year: 2025,
      roles: ['Rendező', 'Vágó'],
    },
    {
      videoId: 'v3',
      slug: 'v3',
      title: 'V3',
      recordedAt: null,
      year: null,
      roles: [],
    },
  ]

  it('év nézet: évek csökkenő, alatta szerepcsoportok; több szerepnél ismétlés', () => {
    const { yearGroups } = groupActivity(rows, 'year')
    expect(yearGroups.map((group) => group.year)).toEqual([2026, 2025, 0])
    const group2025 = yearGroups.find((group) => group.year === 2025)
    expect(group2025?.groups.map((entry) => entry.roleName).sort()).toEqual([
      'Rendező',
      'Vágó',
    ])
    // Ugyanaz a videó mindkét szerepcsoportban megjelenik.
    for (const entry of group2025?.groups ?? []) {
      expect(entry.videos.map((video) => video.videoId)).toEqual(['v2'])
    }
    // Szerep nélküli videó „Stábtag” csoportba kerül.
    const group0 = yearGroups.find((group) => group.year === 0)
    expect(group0?.groups.at(0)?.roleName).toBe('Stábtag')
  })

  it('szerep nézet: szerepek alatt időrendben a videók', () => {
    const { roleGroups } = groupActivity(rows, 'role')
    const rendezo = roleGroups.find((group) => group.roleName === 'Rendező')
    expect(rendezo?.videos.map((video) => video.videoId)).toEqual(['v1', 'v2'])
    const vago = roleGroups.find((group) => group.roleName === 'Vágó')
    expect(vago?.videos.map((video) => video.videoId)).toEqual(['v2'])
  })
})
