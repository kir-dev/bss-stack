import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, eq, inArray } from 'drizzle-orm'
import { videos } from '#/db/schema.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { viewerFromIdentity } from '#/server/auth/viewer.ts'
import {
  visibleVideoCondition,
  canSeeVideo,
} from '#/server/videos/visibility.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const testConfig: OobConfig = validateOobConfig(buildRawOobConfig())

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

const anonymous: Viewer = { level: 'anonymous', sub: null, username: null }
const schonherz: Viewer = {
  level: 'schonherz',
  sub: 's1',
  username: 'schonherz-dev',
}
const member: Viewer = viewerFromIdentity(
  { sub: 't1', username: 'tag-dev', groups: ['Stúdiós'] },
  testConfig.authentik,
)

async function setupSeededDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_vis')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())

  const rows = [
    ['pub-published', 'public', 'published'],
    ['sch-published', 'schonherz', 'published'],
    ['bss-published', 'bss', 'published'],
    ['pub-draft', 'public', 'draft'],
    ['pub-archived', 'public', 'archived'],
    ['pub-trash', 'public', 'trash'],
  ] as const

  for (const [slug, visibility, status] of rows) {
    await migrated.db.insert(videos).values({
      slug,
      title: `Titkos cím: ${slug}`,
      visibility,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      trashedAt: status === 'trash' ? new Date() : null,
    })
  }

  return migrated.db
}

async function visibleSlugsFor(
  db: NodePgDatabase<Record<string, never>>,
  viewer: Viewer,
): Promise<string[]> {
  const rows = await db
    .select({ slug: videos.slug })
    .from(videos)
    .where(and(eq(videos.status, 'published'), visibleVideoCondition(viewer)))
  return rows.map((row) => row.slug).sort()
}

describe.skipIf(!hasTestDatabase)(
  'BSS-007: videóláthatóság SQL-feltételei (valódi adatbázison)',
  () => {
    it('névtelen néző csak publikus, publikált videót lát', async () => {
      const db = await setupSeededDb()
      const slugs = await visibleSlugsFor(db, anonymous)
      expect(slugs).toEqual(['pub-published'])
    })

    it('schönherzes a publikus és a schönherzes videót látja', async () => {
      const db = await setupSeededDb()
      const slugs = await visibleSlugsFor(db, schonherz)
      expect(slugs).toEqual(['pub-published', 'sch-published'])
    })

    it('tag és vezetőség mindhárom láthatóságot eléri', async () => {
      const db = await setupSeededDb()
      expect(await visibleSlugsFor(db, member)).toEqual([
        'bss-published',
        'pub-published',
        'sch-published',
      ])
      const leadership: Viewer = viewerFromIdentity(
        {
          sub: 'v1',
          username: 'vezetoseg-dev',
          groups: ['Vezetőség'],
        },
        testConfig.authentik,
      )
      expect(await visibleSlugsFor(db, leadership)).toEqual([
        'bss-published',
        'pub-published',
        'sch-published',
      ])
    })

    it('piszkozat, archivált és lomtárban lévő videó senkinek nem jelenik meg listában', async () => {
      const db = await setupSeededDb()
      for (const viewer of [anonymous, schonherz, member]) {
        const slugs = await visibleSlugsFor(db, viewer)
        expect(slugs).not.toContain('pub-draft')
        expect(slugs).not.toContain('pub-archived')
        expect(slugs).not.toContain('pub-trash')
      }
    })

    it('tiltott videó metaadata nem kerül a válaszba', async () => {
      const db = await setupSeededDb()
      const result = await db
        .select()
        .from(videos)
        .where(visibleVideoCondition(anonymous))
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('Titkos cím: sch-published')
      expect(serialized).not.toContain('Titkos cím: bss-published')
    })

    it('inArray-alapú lekérdezésben is szűr a feltétel', async () => {
      const db = await setupSeededDb()
      const rows = await db
        .select({ slug: videos.slug })
        .from(videos)
        .where(
          and(
            inArray(videos.slug, [
              'pub-published',
              'sch-published',
              'bss-published',
            ]),
            visibleVideoCondition(schonherz),
          ),
        )
      expect(rows.map((row) => row.slug).sort()).toEqual([
        'pub-published',
        'sch-published',
      ])
    })
  },
)

describe('canSeeVideo memóriabeli szabály', () => {
  it('a négy szinthez konzisztens eredményt ad', () => {
    expect(canSeeVideo(anonymous, 'public')).toBe(true)
    expect(canSeeVideo(anonymous, 'schonherz')).toBe(false)
    expect(canSeeVideo(anonymous, 'bss')).toBe(false)
    expect(canSeeVideo(schonherz, 'schonherz')).toBe(true)
    expect(canSeeVideo(schonherz, 'bss')).toBe(false)
    expect(canSeeVideo(member, 'bss')).toBe(true)
  })
})
