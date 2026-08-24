import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { resolvePublicSlug } from '#/server/pages/slug-route.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import type { ViewerState } from '#/server/pages/viewer.ts'
import { createAuthSession } from '#/server/auth/session-store.ts'
import { SESSION_COOKIE_NAME } from '#/server/auth/session-cookies.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { events, slugHistory, videos } from '#/db/schema.ts'
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
const testConfig: OobConfig = validateOobConfig(buildRawOobConfig())

const anonymous = anonymousViewer()
const memberViewer: Viewer = {
  level: 'member',
  sub: 'member-sub',
  username: 'tag',
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_slugroute')
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
      visibility: 'public',
      publishedAt: new Date('2026-06-01T10:00:00.000Z'),
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-019: publikus slug feloldás', () => {
  it('aktuális publikált slugon current-et ad', async () => {
    const db = await setupDb()
    await seedVideo(db, { slug: 'elso-adas' })
    expect(
      await resolvePublicSlug(db, {
        entityType: 'video',
        slug: 'elso-adas',
        viewer: anonymous,
      }),
    ).toEqual({
      kind: 'current',
      entityId: expect.any(String),
      canonicalSlug: 'elso-adas',
    })
  })

  it('piszkozat, archivált és lomtár 404 (null)', async () => {
    const db = await setupDb()
    await seedVideo(db, { slug: 'piszkozat-video', status: 'draft' })
    await seedVideo(db, { slug: 'archivalt-video', status: 'archived' })
    await seedVideo(db, {
      slug: 'lomtar-video',
      status: 'trash',
      trashedAt: new Date('2026-07-01T10:00:00.000Z'),
      trashedBy: null,
    })
    for (const slug of ['piszkozat-video', 'archivalt-video', 'lomtar-video']) {
      expect(
        await resolvePublicSlug(db, {
          entityType: 'video',
          slug,
          viewer: memberViewer,
        }),
      ).toBeNull()
    }
  })

  it('nem látható videó metaadata nem oldható fel névtelenül, tag számára igen', async () => {
    const db = await setupDb()
    await seedVideo(db, { slug: 'bss-only', visibility: 'bss' })
    expect(
      await resolvePublicSlug(db, {
        entityType: 'video',
        slug: 'bss-only',
        viewer: anonymous,
      }),
    ).toBeNull()
    expect(
      await resolvePublicSlug(db, {
        entityType: 'video',
        slug: 'bss-only',
        viewer: memberViewer,
      }),
    ).toMatchObject({ kind: 'current', canonicalSlug: 'bss-only' })
  })

  it('régi slug az új canonical route-ra irányít; nem publikált entitásra nem', async () => {
    const db = await setupDb()
    const video = await seedVideo(db, { slug: 'uj-slug' })
    await db.insert(slugHistory).values({
      entityType: 'video',
      slug: 'regi-slug',
      entityId: video.id,
      createdAt: new Date(),
    })
    expect(
      await resolvePublicSlug(db, {
        entityType: 'video',
        slug: 'regi-slug',
        viewer: anonymous,
      }),
    ).toMatchObject({ kind: 'redirect', canonicalSlug: 'uj-slug' })

    // Az átirányítás után a régi slugra már nincs "current" találat.
    await db
      .update(videos)
      .set({ status: 'draft' })
      .where(eq(videos.id, video.id))
    expect(
      await resolvePublicSlug(db, {
        entityType: 'video',
        slug: 'regi-slug',
        viewer: memberViewer,
      }),
    ).toBeNull()
  })

  it('eseménynél csak publikált állapot oldható fel', async () => {
    const db = await setupDb()
    await db.insert(events).values([
      {
        slug: 'publikus-esemeny',
        title: 'Publikus',
        startDate: '2026-05-01',
        status: 'published',
      },
      { slug: 'piszkozat-esemeny', title: 'Piszkozat', status: 'draft' },
    ])
    expect(
      await resolvePublicSlug(db, {
        entityType: 'event',
        slug: 'publikus-esemeny',
        viewer: anonymous,
      }),
    ).toMatchObject({ kind: 'current' })
    expect(
      await resolvePublicSlug(db, {
        entityType: 'event',
        slug: 'piszkozat-esemeny',
        viewer: anonymous,
      }),
    ).toBeNull()
  })
})

describe.skipIf(!hasTestDatabase)('BSS-019: nézői állapot kérésből', () => {
  it('session cookie nélkül névtelen', async () => {
    const request = new Request('http://localhost/videos')
    const state = await resolveViewerStateFromRequest(request, {
      config: testConfig,
    })
    expect(state).toEqual({
      viewer: { level: 'anonymous', sub: null, username: null },
      loggedIn: false,
    } satisfies ViewerState)
  })

  it('érvényes tag sessionből member néző lesz', async () => {
    const db = await setupDb()
    const created = await createAuthSession(
      {
        memberSub: 'sub-123',
        username: 'teszt-tag',
        groups: ['tag-dev'],
        accessToken: null,
      },
      { db },
    )
    const request = new Request('http://localhost/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${created.token}` },
    })
    const state = await resolveViewerStateFromRequest(request, {
      db,
      config: testConfig,
    })
    expect(state.loggedIn).toBe(true)
    expect(state.viewer.level).toBe('member')
    expect(state.viewer.username).toBe('teszt-tag')

    // Rossz token: névtelen, nem hibázik.
    const bad = new Request('http://localhost/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=nincs-ilyen` },
    })
    const badState = await resolveViewerStateFromRequest(bad, {
      db,
      config: testConfig,
    })
    expect(badState.loggedIn).toBe(false)
  })
})
