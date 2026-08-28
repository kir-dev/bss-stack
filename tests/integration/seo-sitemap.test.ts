import { afterAll, describe, expect, it } from 'vitest'
import type { Database } from '#/server/auth/session-store.ts'
import { events, videos } from '#/db/schema.ts'
import { getSitemapEntries, sitemapXml } from '#/server/pages/sitemap.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'
import { buildEvent, buildVideo } from '../helpers/factories.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

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

async function setupDb(): Promise<Database> {
  const migrated = await createMigratedTestDatabase('bss_seo')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

describe.skipIf(!hasTestDatabase)(
  'BSS-035: sitemap csak publikus tartalmat listáz',
  () => {
    it('publikus videót és eseményt tartalmaz, korlátozott és piszkozatvideót nem', async () => {
      const db = await setupDb()

      const publishedEvent = buildEvent({
        slug: 'teszt-esemeny',
        status: 'published',
      })
      await db.insert(events).values(publishedEvent)
      await db
        .insert(events)
        .values(buildEvent({ slug: 'piszkozat-esemeny', status: 'draft' }))

      const published = new Date('2026-06-01T10:00:00.000Z')
      const rowsToInsert = [
        buildVideo({
          slug: 'publikus-video',
          status: 'published',
          publishedAt: published,
        }),
        buildVideo({
          slug: 'schonherz-video',
          status: 'published',
          visibility: 'schonherz',
          publishedAt: published,
        }),
        buildVideo({
          slug: 'bss-video',
          status: 'published',
          visibility: 'bss',
          publishedAt: published,
        }),
        buildVideo({ slug: 'piszkozat-video', status: 'draft' }),
        buildVideo({ slug: 'archivalt-video', status: 'archived' }),
      ]
      for (const row of rowsToInsert) {
        await db.insert(videos).values({ ...row, eventId: null })
      }
      await db.insert(videos).values({
        ...buildVideo({ slug: 'lomtar-video', status: 'trash' }),
        trashedAt: published,
        eventId: null,
      })

      const entries = await getSitemapEntries(db)
      const paths = entries.map((entry) => entry.path)

      expect(paths).toContain('/videos/publikus-video')
      expect(paths).toContain('/events/teszt-esemeny')
      // Statikus útvonalak
      expect(paths).toContain('/videos')
      expect(paths).toContain('/events')
      expect(paths).toContain('/members')
      expect(paths).toContain('/about')

      expect(paths).not.toContain('/videos/schonherz-video')
      expect(paths).not.toContain('/videos/bss-video')
      expect(paths).not.toContain('/videos/piszkozat-video')
      expect(paths).not.toContain('/videos/archivalt-video')
      expect(paths).not.toContain('/videos/lomtar-video')
      expect(paths).not.toContain('/events/piszkozat-esemeny')
    })

    it('a sitemap XML abszolút URL-eket ad', () => {
      const xml = sitemapXml(
        [{ path: '/videos/abc', lastmod: '2026-08-24T10:00:00.000Z' }],
        'http://localhost:3000',
      )
      expect(xml).toContain('<loc>http://localhost:3000/videos/abc</loc>')
      expect(xml).toContain('<lastmod>2026-08-24T10:00:00.000Z</lastmod>')
      expect(xml).toContain('urlset')
    })
  },
)
