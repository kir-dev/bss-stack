import { afterAll, describe, expect, it } from 'vitest'
import { handleSearch } from '#/server/api/search-routes.ts'
import type {
  Database,
  Database as SessionDatabase,
} from '#/server/auth/session-store.ts'
import { createAuthSession } from '#/server/auth/session-store.ts'
import { SESSION_COOKIE_NAME } from '#/server/auth/session-cookies.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { events, memberCache, tags, videos } from '#/db/schema.ts'
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

interface SearchDeps {
  db?: SessionDatabase
}

async function searchRequest(
  path: string,
  deps: SearchDeps = {},
): Promise<Response> {
  return handleSearch(new Request(`http://localhost${path}`), {
    ...deps,
    config: testConfig,
  })
}

describe.skipIf(!hasTestDatabase)('BSS-025: kereső végpont', () => {
  it('rövid kifejezés nem ér adatbázist, üres eredményt ad', async () => {
    await setupDb()
    const response = await searchRequest('/api/search?q=a')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      query: 'a',
      videos: [],
      events: [],
      members: [],
      tags: [],
    })
  })

  it('találatok csoportosítva; címke és tag megnevezés nem keveredik', async () => {
    const db = await setupDb()
    await db.insert(tags).values([{ name: 'BSTV', normalizedName: 'bstv' }])
    await db.insert(events).values({
      slug: 'bstv-adas',
      title: 'BSTV Adás',
      startDate: '2026-05-01',
      status: 'published',
    })
    await seedVideo(db, { slug: 'bstv-video', title: 'BSTV riport' })

    const response = await searchRequest('/api/search?q=bstv', { db })
    const body = await response.json()
    expect(body.videos.map((v: { slug: string }) => v.slug)).toEqual([
      'bstv-video',
    ])
    expect(body.events.map((e: { slug: string }) => e.slug)).toEqual([
      'bstv-adas',
    ])
    expect(body.tags.map((t: { name: string }) => t.name)).toEqual(['BSTV'])
    expect(body.members).toEqual([])
  })

  it('tiltott videó metaadata nem szivárog névtelenül, tag számára látszik', async () => {
    const db = await setupDb()
    await seedVideo(db, {
      slug: 'titkos-bstv',
      title: 'Titkos BSTV anyag',
      visibility: 'bss',
    })

    const anonymousResponse = await searchRequest(
      '/api/search?q=titkos%20bstv',
      {
        db,
      },
    )
    const anonymousBody = await anonymousResponse.json()
    expect(anonymousBody.videos).toEqual([])

    // Tag belépéssel ugyanaz a kifejezés megtalálja.
    const created = await createAuthSession(
      {
        memberSub: 'member-sub',
        username: 'tag',
        groups: ['tag-dev'],
        accessToken: null,
      },
      { db },
    )
    const memberReq = new Request('http://localhost/api/search?q=titkos bstv', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${created.token}` },
    })
    const memberBody = await handleSearch(memberReq, {
      db,
      config: testConfig,
    }).then((response) => response.json())
    expect(memberBody.videos.map((v: { slug: string }) => v.slug)).toEqual([
      'titkos-bstv',
    ])
  })

  it('limit paraméter 1–10 közti értékre működik', async () => {
    const db = await setupDb()
    await seedMember(db)
    for (let index = 0; index < 12; index += 1) {
      await seedVideo(db, {
        slug: `neves-${index}`,
        title: `Neves előadó ${index}`,
      })
    }
    const response = await searchRequest('/api/search?q=neves&limit=3', { db })
    const body = await response.json()
    expect(body.videos).toHaveLength(3)

    const cappedResponse = await searchRequest('/api/search?q=neves&limit=99', {
      db,
    })
    const cappedBody = await cappedResponse.json()
    expect(cappedBody.videos).toHaveLength(10)
  })
})

async function setupDb(): Promise<Database> {
  const migrated = await createMigratedTestDatabase('bss_searchapi')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

async function seedVideo(
  db: Database,
  overrides: Partial<typeof videos.$inferInsert>,
): Promise<void> {
  await db.insert(videos).values({
    slug: overrides.slug ?? `video-${Math.random().toString(36).slice(2)}`,
    title: overrides.title ?? 'Videó',
    status: 'published',
    visibility: 'public',
    publishedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  })
}

async function seedMember(db: Database): Promise<void> {
  await db.insert(memberCache).values({
    sub: 'member-sub',
    username: 'tag',
    fullName: 'BSS Tag',
    membershipStatus: 'MEMBER',
  })
}
