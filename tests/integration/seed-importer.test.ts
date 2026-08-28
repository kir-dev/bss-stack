import { afterAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import {
  auditLog,
  memberCache,
  staffRoles,
  videoStaff,
  videos,
} from '#/db/schema.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { importSeed } from '#/server/seed/importer.ts'
import { validateSeedJson } from '#/server/seed/schema.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)
const config = validateOobConfig(buildRawOobConfig())

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
  const migrated = await createMigratedTestDatabase('bss_seed')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

async function seedMember(db: Database, username: string): Promise<string> {
  const sub = `sub-${username}`
  await db.insert(memberCache).values({
    sub,
    username,
    fullName: `${username} Teljes Neve`,
    nickname: username,
    membershipStatus: 'studio_member',
    isLeadership: false,
  })
  return sub
}

function baseSeed(): Record<string, unknown> {
  return {
    version: 1,
    events: [
      {
        key: 'gala-2025',
        title: 'Tavaszi Gála 2025',
        startDate: '2025-05-10',
        endDate: null,
        status: 'published',
      },
    ],
    tags: ['Gála'],
    staffRoles: ['Operatőr', 'Vágó'],
    videos: [
      {
        key: 'vid-001',
        title: 'Gálanyitó 2025',
        encodingGroup: '16a9_HD',
        hasHq: true,
        hasLq: true,
        baseFilename: 'galanyito',
        recordedAt: '2025-05-10',
        publishedAt: '2025-06-01T12:00:00Z',
        eventKey: 'gala-2025',
        tags: ['Gála'],
        staff: [{ username: 'tag-dev-seed', role: 'Operatőr' }],
      },
    ],
  }
}

describe.skipIf(!hasTestDatabase)('BSS-034: seed JSON validáció', () => {
  it('tiltott mező (email, bemutatkozás) magyar hibával elutasul (spec 17.1)', () => {
    const seed = baseSeed()
    const withEmail = {
      ...seed,
      videos: [
        {
          ...(seed.videos as Array<Record<string, unknown>>)[0],
          email: 'x@example.com',
        },
      ],
    }
    expect(() => validateSeedJson(withEmail, config.media)).toThrow(/email/)

    const withIntroduction = {
      ...seed,
      people: [{ username: 'valaki', introduction: 'Bemutatkozás szövege' }],
    }
    expect(() => validateSeedJson(withIntroduction, config.media)).toThrow(
      /bemutatkozás/i,
    )
  })

  it('több mint ötven videó elutasul (spec 17.1)', () => {
    const manyVideos = Array.from({ length: 51 }, (_, index) => ({
      key: `v${index}`,
      title: `Videó ${index}`,
    }))
    expect(() =>
      validateSeedJson({ ...baseSeed(), videos: manyVideos }, config.media),
    ).toThrow(/legfeljebb 50 videó/i)
  })

  it('érvénytelen videóprofil elutasul', () => {
    const seed = baseSeed()
    const foreignHost = {
      ...seed,
      videos: [
        {
          ...(seed.videos as Array<Record<string, unknown>>)[0],
          encodingGroup: 'cinema',
        },
      ],
    }
    expect(() => validateSeedJson(foreignHost, config.media)).toThrow(
      /érvénytelen érték/,
    )
  })

  it('publikált videó hiányzó médiája elutasul (spec 5.3)', () => {
    const noMedia = {
      ...baseSeed(),
      events: [],
      videos: [{ key: 'v1', title: 'Média nélkül publikálva' }],
    }
    const problems = (() => {
      try {
        validateSeedJson(noMedia, config.media)
        return ''
      } catch (error) {
        return (error as Error).message
      }
    })()
    expect(problems).toContain('encodingGroup kötelező')
    expect(problems).toContain('legalább egy minőség kötelező')
    expect(problems).toContain('baseFilename kötelező')
  })

  it('ismeretlen eseménykulcs, címke vagy szerep elutasul', () => {
    const seed = baseSeed()
    const videos0 = (seed.videos as Array<Record<string, unknown>>)[0]
    expect(() =>
      validateSeedJson(
        { ...seed, videos: [{ ...videos0, eventKey: 'nincs-ilyen' }] },
        config.media,
      ),
    ).toThrow(/ismeretlen eseménykulcs/i)
    expect(() =>
      validateSeedJson(
        { ...seed, videos: [{ ...videos0, tags: ['NincsIlyen'] }] },
        config.media,
      ),
    ).toThrow(/tags listába/)
    expect(() =>
      validateSeedJson(
        {
          ...seed,
          videos: [
            {
              ...videos0,
              staff: [{ username: 'tag-dev-seed', role: 'NemLétező' }],
            },
          ],
        },
        config.media,
      ),
    ).toThrow(/staffRoles listába/)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-034: idempotens seed importer', () => {
  it('tiszta adatbázison betölt; újrafuttatás nem duplikál és nem ír auditot', async () => {
    const db = await setupDb()
    await seedMember(db, 'tag-dev-seed')

    const first = await importSeed(db, {
      seed: validateSeedJson(baseSeed(), config.media),
    })
    expect(first.createdEvents).toBe(1)
    expect(first.createdTags).toBe(1)
    expect(first.createdStaffRoles).toBe(2)
    expect(first.createdVideos).toBe(1)
    expect(first.tagLinks).toBe(1)
    expect(first.staffLinks).toBe(1)

    const video = (await db.select().from(videos))[0]
    expect(video.slug).toBe('galanyito-2025')
    expect(video.status).toBe('published')

    const second = await importSeed(db, {
      seed: validateSeedJson(baseSeed(), config.media),
    })
    expect(second.createdEvents).toBe(0)
    expect(second.updatedEvents).toBe(0)
    expect(second.createdTags).toBe(0)
    expect(second.createdStaffRoles).toBe(0)
    expect(second.createdVideos).toBe(0)
    expect(second.updatedVideos).toBe(0)

    const videoAfterRerun = (await db.select().from(videos))[0]
    // Az újrafuttatás nem bántja a meglévő sort (nincs verzióugrás).
    expect(videoAfterRerun.version).toBe(video.version)

    const auditCount = Number(
      (
        await db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${auditLog}`,
        )
      ).rows[0]?.count,
    )
    // Minden entitásra pontosan egy create-audit készült (1 esemény + 1 videó);
    // a címkék és szerepek létrehozása nem auditolt katalógusfeltöltés.
    expect(auditCount).toBe(2)
  })

  it('a stábkapcsolat a tagcache-beli Authentik sub-hoz kötődik', async () => {
    const db = await setupDb()
    const sub = await seedMember(db, 'tag-dev-seed')
    await importSeed(db, { seed: validateSeedJson(baseSeed(), config.media) })

    const links = await db.select().from(videoStaff)
    expect(links).toHaveLength(1)
    expect(links[0].memberSub).toBe(sub)

    const role = (
      await db.select().from(staffRoles).where(eq(staffRoles.name, 'Operatőr'))
    )[0]
    expect(links[0].roleId).toBe(role.id)
  })

  it('megváltozott seedmezőt szinkronizál', async () => {
    const db = await setupDb()
    await seedMember(db, 'tag-dev-seed')
    await importSeed(db, { seed: validateSeedJson(baseSeed(), config.media) })

    const seed = baseSeed()
    ;(seed.videos as Array<Record<string, unknown>>)[0].description =
      'Új leírás a seedből'
    const result = await importSeed(db, {
      seed: validateSeedJson(seed, config.media),
    })
    expect(result.updatedVideos).toBe(1)
    expect(result.createdVideos).toBe(0)

    const row = (await db.select().from(videos))[0]
    expect(row.description).toBe('Új leírás a seedből')
  })

  it('hiányzó stábtag-felhasználónál magyar hiba szól a szinkronról', async () => {
    const db = await setupDb()
    await expect(() =>
      importSeed(db, { seed: validateSeedJson(baseSeed(), config.media) }),
    ).rejects.toThrow(/nem találhatók a tagcache-ben[\s\S]*tag-dev-seed/)
  })
})
