import { afterAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import {
  createTestDatabase,
  applyDrizzleMigrations,
} from '../helpers/test-db.ts'
import type { TestDatabase } from '../helpers/test-db.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const databases: TestDatabase[] = []

afterAll(async () => {
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

async function createMigratedDatabase(): Promise<{
  database: TestDatabase
  client: Client
}> {
  const database = await createTestDatabase('bss_schema_test')
  databases.push(database)

  const client = new Client({ connectionString: database.connectionString })
  await client.connect()
  await applyDrizzleMigrations(client)

  return { database, client }
}

describe.skipIf(!hasTestDatabase)('új adatbázisséma és migrációs alap', () => {
  it('tiszta adatbázison a migráció lefut és minden tábla létezik', async () => {
    const { client } = await createMigratedDatabase()
    try {
      const result = await client.query<{ table_name: string }>(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
          ORDER BY table_name
        `)
      const tables = result.rows.map((row) => row.table_name)
      expect(tables).toEqual(
        expect.arrayContaining([
          'about_page_videos',
          'audit_log',
          'events',
          'live_streams',
          'member_cache',
          'related_videos',
          'site_settings',
          'slug_history',
          'staff_roles',
          'tags',
          'video_staff',
          'video_tags',
          'videos',
          'view_sessions',
        ]),
      )
    } finally {
      await client.end()
    }
  }, 30_000)

  it('a séma adatbázis-korlátokkal védi az invariánsokat', async () => {
    const { client } = await createMigratedDatabase()
    try {
      await client.query(
        "INSERT INTO member_cache (sub, username, full_name, membership_status) VALUES ('sub1','user1','Egy Tag','MEMBER')",
      )

      await expect(
        client.query(
          "INSERT INTO videos (slug, title, status) VALUES ('pub1','Publikálhatatlan','published')",
        ),
      ).rejects.toThrow(/check/i)

      await client.query(
        "INSERT INTO videos (id, slug, title) VALUES ('11111111-1111-1111-1111-111111111111','v1','V1')",
      )
      await expect(
        client.query(
          "INSERT INTO related_videos VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',1)",
        ),
      ).rejects.toThrow(/check|self_reference/i)

      const inserted = await client.query(
        "INSERT INTO videos (id, slug, title) VALUES ('22222222-2222-2222-2222-222222222222','v2','V2') RETURNING id",
      )

      void inserted

      await expect(
        client.query(
          "INSERT INTO events (slug,title,start_date,end_date) VALUES ('e1','E1','2026-06-10','2026-06-09')",
        ),
      ).rejects.toThrow()

      await expect(
        client.query(
          "INSERT INTO about_page_videos VALUES (7,'11111111-1111-1111-1111-111111111111')",
        ),
      ).rejects.toThrow(/check/i)
    } finally {
      await client.end()
    }
  }, 30_000)

  it('a videó forrása kizárólagos: YouTube-forrás szerveres médiamezők nélkül, szerveres forrás YouTube-azonosító nélkül', async () => {
    const { client } = await createMigratedDatabase()
    try {
      const defaulted = await client.query<{
        media_source: string
        youtube_video_id: string | null
      }>(
        "INSERT INTO videos (slug, title) VALUES ('alap','Alap') RETURNING media_source, youtube_video_id",
      )
      expect(defaulted.rows[0]).toEqual({
        media_source: 'server',
        youtube_video_id: null,
      })

      await client.query(
        "INSERT INTO videos (slug, title, media_source, youtube_video_id) VALUES ('yt','YT','youtube','aBcDeFgHiJk')",
      )

      await expect(
        client.query(
          "INSERT INTO videos (slug, title, media_source, youtube_video_id, base_filename) VALUES ('yt-fajlnev','X','youtube','aBcDeFgHiJk','x')",
        ),
      ).rejects.toThrow(/check/i)
      await expect(
        client.query(
          "INSERT INTO videos (slug, title, media_source, youtube_video_id, has_hq) VALUES ('yt-hq','X','youtube','aBcDeFgHiJk',true)",
        ),
      ).rejects.toThrow(/check/i)
      await expect(
        client.query(
          "INSERT INTO videos (slug, title, media_source, youtube_video_id) VALUES ('szerver-yt','X','server','aBcDeFgHiJk')",
        ),
      ).rejects.toThrow(/check/i)
    } finally {
      await client.end()
    }
  }, 30_000)
})
