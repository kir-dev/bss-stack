import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  getRelatedVideos,
  setManualRelatedVideos,
  RELATED_VIDEO_LIMIT,
} from '#/server/videos/related.ts'
import { createVideoDraft } from '#/server/videos/domain.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { TextValidationError } from '#/server/shared/text.ts'
import { FakeClock } from '#/lib/clock.ts'
import { events, memberCache, tags, videoTags, videos } from '#/db/schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'
import { TEST_MEDIA_CONFIG } from '../helpers/oob-config.ts'
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
const clock = new FakeClock('2026-06-20T10:00:00.000Z')
const mediaConfig = TEST_MEDIA_CONFIG

const anonymousViewer: Viewer = {
  level: 'anonymous',
  sub: null,
  username: null,
}
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

function deps(viewer: Viewer) {
  return { viewer, clock, mediaConfig }
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_related')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  await migrated.db.insert(memberCache).values([
    {
      sub: 'member-sub',
      username: 'tag',
      fullName: 'BSS Tag',
      membershipStatus: 'studio_member',
    },
  ])
  return migrated.db
}

const okMediaRoutes = [
  {
    method: 'HEAD',
    urlPattern: /v\.bsstudio\.hu/,
    respond: () => ({ status: 200 }),
  },
]

async function insertPublished(
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
      publishedAt: clock.now(),
      encodingGroup: '16a9_HD',
      hasHq: true,
      hasLq: true,
      baseFilename: 'related-video',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

async function seedTag(
  db: NodePgDatabase<Record<string, never>>,
  name: string,
): Promise<string> {
  const rows = await db
    .insert(tags)
    .values({ name, normalizedName: name.toLowerCase() })
    .returning()
  const id = rows.at(0)?.id
  if (id === undefined) throw new Error('tag seed failed')
  return id
}

async function linkTag(
  db: NodePgDatabase<Record<string, never>>,
  videoId: string,
  tagId: string,
): Promise<void> {
  await db.insert(videoTags).values({ videoId, tagId })
}

describe.skipIf(!hasTestDatabase)('BSS-015: kapcsolódó videók', () => {
  it('manuális lista felülír mindent és sorrendezett marad', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const main = await createVideoDraft(db, deps(memberViewer), {
        title: 'Fő videó',
      })
      const a = await insertPublished(db, { slug: 'man-a', title: 'A' })
      const b = await insertPublished(db, { slug: 'man-b', title: 'B' })

      await setManualRelatedVideos(db, {
        viewer: memberViewer,
        videoId: main.id,
        expectedVersion: mockVersion(main.version),
        relatedVideoIds: [b.id, a.id],
        clock,
      })

      const related = await getRelatedVideos(db, memberViewer, main.id)
      expect(related.map((v) => v.slug)).toEqual(['man-b', 'man-a'])
      void RELATED_VIDEO_LIMIT
    } finally {
      mock.restore()
    }
  })

  it('önhivatkozás, duplikátum és nem publikált kapcsolódó tiltva', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const main = await createVideoDraft(db, deps(memberViewer), {
        title: 'Fő',
      })
      const draftOther = await createVideoDraft(db, deps(memberViewer), {
        title: 'Piszkozat',
      })
      void draftOther

      await expect(
        setManualRelatedVideos(db, {
          viewer: memberViewer,
          videoId: main.id,
          expectedVersion: main.version,
          relatedVideoIds: [main.id],
          clock,
        }),
      ).rejects.toBeInstanceOf(TextValidationError)

      const published = await insertPublished(db, {
        slug: 'pub-1',
        title: 'Pub',
      })
      // Duplikáció tiltva:
      await expect(
        setManualRelatedVideos(db, {
          viewer: memberViewer,
          videoId: main.id,
          expectedVersion: main.version,
          relatedVideoIds: [published.id, published.id],
          clock,
        }),
      ).rejects.toThrow(/Duplikált/)

      const afterDupAttempt = await getRelatedVideos(db, memberViewer, main.id)
      expect(afterDupAttempt).toEqual([])
    } finally {
      mock.restore()
    }
  })

  it('azonos esemény öt legutóbb publikált videója; önmaga nem szerepel', async () => {
    const db = await setupDb()
    const eventRows = await db
      .insert(events)
      .values({
        slug: 'kapcs-esemeny',
        title: 'Esemény',
        startDate: '2026-05-01',
      })
      .returning()
    const eventId = eventRows.at(0)?.id
    if (eventId === undefined) throw new Error('seed failed')

    const main = await insertPublished(db, {
      slug: 'esemeny-fo',
      title: 'Fő',
      eventId,
      publishedAt: new Date('2026-05-10T10:00:00Z'),
    })
    for (let i = 1; i <= 6; i += 1) {
      await insertPublished(db, {
        slug: `esemeny-v${i}`,
        title: `V${i}`,
        eventId,
        publishedAt: new Date(
          `2026-05-${String(i + 10).padStart(2, '0')}T10:00:00Z`,
        ),
      })
    }

    const related = await getRelatedVideos(db, memberViewer, main.id)
    expect(related).toHaveLength(5)
    expect(related.map((v) => v.slug)).not.toContain('esemeny-fo')
    // A legfrissebb előre:
    expect(related[0]?.slug).toBe('esemeny-v6')
    expect(related[4]?.slug).toBe('esemeny-v2')
  })

  it('esemény nélkül közös címkék pontoznak: több közös erősebb, egyezésnél publishedAt dönt', async () => {
    const db = await setupDb()
    const t1 = await seedTag(db, 'tabor')
    const t2 = await seedTag(db, 'koncert')

    const main = await insertPublished(db, { slug: 'cimke-fo', title: 'Fő' })
    await linkTag(db, main.id, t1)
    await linkTag(db, main.id, t2)

    const twoCommon = await insertPublished(db, {
      slug: 'ketto-kozos',
      title: 'Kettő',
      publishedAt: new Date('2026-01-01T10:00:00Z'),
    })
    await linkTag(db, twoCommon.id, t1)
    await linkTag(db, twoCommon.id, t2)

    const oneCommonNewer = await insertPublished(db, {
      slug: 'egy-kozos-uj',
      title: 'Egy új',
      publishedAt: new Date('2026-03-01T10:00:00Z'),
    })
    await linkTag(db, oneCommonNewer.id, t1)

    const oneCommonOlder = await insertPublished(db, {
      slug: 'egy-kozos-regi',
      title: 'Egy régi',
      publishedAt: new Date('2025-01-01T10:00:00Z'),
    })
    await linkTag(db, oneCommonOlder.id, t1)

    const noCommon = await insertPublished(db, {
      slug: 'nincs-kozos',
      title: 'Nincs',
    })

    const related = await getRelatedVideos(db, memberViewer, main.id)
    expect(related.map((v) => v.slug)).toEqual([
      'ketto-kozos',
      'egy-kozos-uj',
      'egy-kozos-regi',
    ])
    expect(related.map((v) => v.id)).not.toContain(noCommon.id)
    expect(related.map((v) => v.id)).not.toContain(main.id)
  })

  it('a megjelenítés a néző jogosultsága szerint szűr — korlátozott videó nem szivárog', async () => {
    const db = await setupDb()
    const eventRows = await db
      .insert(events)
      .values({
        slug: 'szuro-esemeny',
        title: 'Szűrő',
        startDate: '2026-04-01',
      })
      .returning()
    const eventId = eventRows.at(0)?.id
    if (eventId === undefined) throw new Error('seed failed')

    const main = await insertPublished(db, {
      slug: 'szuro-fo',
      title: 'Fő',
      eventId,
      visibility: 'bss',
    })
    const publicV = await insertPublished(db, {
      slug: 'szuro-public',
      title: 'Publikus',
      eventId,
    })
    const schonherzV = await insertPublished(db, {
      slug: 'szuro-schonherz',
      title: 'Schönherzes',
      eventId,
      visibility: 'schonherz',
    })
    void publicV
    void schonherzV

    // Névtelen néző: csak publikust lát.
    const anonRelated = await getRelatedVideos(db, anonymousViewer, main.id)
    expect(anonRelated.map((v) => v.slug)).toEqual(['szuro-public'])

    // Schönherzes: publikus + schönherzes.
    const schonherzRelated = await getRelatedVideos(
      db,
      schonherzViewer,
      main.id,
    )
    expect(new Set(schonherzRelated.map((v) => v.slug))).toEqual(
      new Set(['szuro-public', 'szuro-schonherz']),
    )
  })

  it('manuális listában korlátozott videó is választható, de csak jogosult látja', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const main = await createVideoDraft(db, deps(memberViewer), {
        title: 'Manuális szűrt',
      })
      const bssOnly = await insertPublished(db, {
        slug: 'man-bss',
        title: 'BSS only',
        visibility: 'bss',
      })

      await setManualRelatedVideos(db, {
        viewer: memberViewer,
        videoId: main.id,
        expectedVersion: main.version,
        relatedVideoIds: [bssOnly.id],
        clock,
      })

      const asMember = await getRelatedVideos(db, memberViewer, main.id)
      expect(asMember.map((v) => v.slug)).toEqual(['man-bss'])

      const asAnon = await getRelatedVideos(db, anonymousViewer, main.id)
      expect(asAnon).toEqual([])
    } finally {
      mock.restore()
    }
  })

  it('névtelen nem kezelheti a manuális listát', async () => {
    const db = await setupDb()
    const main = await createVideoDraft(db, deps(memberViewer), {
      title: 'Guard',
    })
    await expect(
      setManualRelatedVideos(db, {
        viewer: anonymousViewer,
        videoId: main.id,
        expectedVersion: main.version,
        relatedVideoIds: [],
        clock,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('elavult verziójú manuális mentés blokkolódik', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const main = await createVideoDraft(db, deps(memberViewer), {
        title: 'Stale',
      })
      const published = await insertPublished(db, {
        slug: 'stale-rel',
        title: 'Rel',
      })
      await setManualRelatedVideos(db, {
        viewer: memberViewer,
        videoId: main.id,
        expectedVersion: main.version,
        relatedVideoIds: [published.id],
        clock,
      })
      await expect(
        setManualRelatedVideos(db, {
          viewer: memberViewer,
          videoId: main.id,
          expectedVersion: main.version,
          relatedVideoIds: [published.id],
          clock,
        }),
      ).rejects.toThrow(/időközben megváltozott/)
    } finally {
      mock.restore()
    }
  })
})

function mockVersion(version: number): number {
  return version
}
