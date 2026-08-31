import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import {
  findFreeSlug,
  renameSlugWithHistory,
  resolveSlugRedirect,
  slugify,
} from '#/server/shared/slug.ts'
import {
  EntityNotFoundError,
  StaleWriteError,
  SYSTEM_ACTOR,
  updateWithOptimisticLock,
} from '#/server/shared/write.ts'
import {
  TEXT_LIMITS,
  TextValidationError,
  validatePlainText,
  validateRequiredText,
} from '#/server/shared/text.ts'
import { FakeClock } from '#/lib/clock.ts'
import { auditLog, events, memberCache, videos } from '#/db/schema.ts'
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

const clock = new FakeClock('2026-06-01T10:00:00.000Z')

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_write')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())

  // A módosító aktorok valós tagokra hivatkoznak (FK).
  await migrated.db.insert(memberCache).values([
    {
      sub: '36',
      username: 'tag-dev',
      fullName: 'Teszt BSS Tag',
      membershipStatus: 'MEMBER',
    },
    {
      sub: '37',
      username: 'vezetoseg-dev',
      fullName: 'Teszt Vezetőségi Tag',
      membershipStatus: 'MEMBER',
    },
  ])

  return migrated.db
}

async function seedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert> = {},
): Promise<typeof videos.$inferSelect> {
  const rows = await db
    .insert(videos)
    .values({ slug: 'seed-video', title: 'Seed videó', ...overrides })
    .returning()
  return rows[0]
}

describe.skipIf(!hasTestDatabase)(
  'BSS-009: slug képzés és ütközéskezelés',
  () => {
    it('slugify ékezeteket old fel, kisbetűsít és kötőjelez', () => {
      expect(slugify('Szentimentális Éjszaka – Főpróba!')).toBe(
        'szentimentalis-ejszaka-foproba',
      )
      expect(slugify('  TÖBB   szó   és & jelek  ')).toBe('tobb-szo-es-jelek')
      expect(slugify('')).toBe('')
    })

    it('ütközésnél számozott utótag készül', async () => {
      const db = await setupDb()
      await seedVideo(db, { slug: 'koncert' })

      const free = await findFreeSlug(db, 'video', 'koncert')
      expect(free).toBe('koncert-2')

      await db.insert(videos).values({ slug: 'koncert-2', title: 'második' })
      expect(await findFreeSlug(db, 'video', 'koncert')).toBe('koncert-3')
    })

    it('a véglegesen törölt entitások slugja a történetben lefoglalt marad', async () => {
      const db = await setupDb()
      // A történetbe bekerült slug már nem használható újra (törölt entitás után sem):
      await db.insert(videos).values({ slug: 'masik-video', title: 'x' })
      await renameSlugWithHistory(db, {
        entityType: 'video',
        entityId: (
          await db.select().from(videos).where(eq(videos.slug, 'masik-video'))
        )[0].id,
        currentSlug: 'masik-video',
        newSlugBase: 'uj-nev',
        now: clock.now(),
      })
      expect(await findFreeSlug(db, 'video', 'masik-video')).not.toBe(
        'masik-video',
      )
    })

    it('átnevezés után a régi slug átirányításként feloldható', async () => {
      const db = await setupDb()
      await db.insert(events).values({
        slug: 'regi-esemeny',
        title: 'Esemény',
        startDate: '2026-05-01',
      })
      const eventRow = (
        await db.select().from(events).where(eq(events.slug, 'regi-esemeny'))
      )[0]

      const newSlug = await renameSlugWithHistory(db, {
        entityType: 'event',
        entityId: eventRow.id,
        currentSlug: 'regi-esemeny',
        newSlugBase: 'Uj Esemény Név!',
        now: clock.now(),
      })
      expect(newSlug).toBe('uj-esemeny-nev')

      const redirect = await resolveSlugRedirect(db, 'event', 'regi-esemeny')
      expect(redirect?.entityId).toBe(eventRow.id)
      expect(await resolveSlugRedirect(db, 'event', 'soha-nem-volt')).toBeNull()
    })

    it('entitástípusonként külön él a slugtér', async () => {
      const db = await setupDb()
      await seedVideo(db, { slug: 'azonos-nev' })
      // ugyanaz a slug eseménynél szabad:
      expect(await findFreeSlug(db, 'event', 'azonos-nev')).toBe('azonos-nev')
    })
  },
)

describe.skipIf(!hasTestDatabase)('BSS-009: optimista zárolás és audit', () => {
  it('elavult mentés konfliktust kap; a győztes mentés auditot kap', async () => {
    const db = await setupDb()
    const videoRow = await seedVideo(db)

    const firstUpdate = updateWithOptimisticLock({
      db,
      entityType: 'video',
      entityId: videoRow.id,
      expectedVersion: videoRow.version,
      changes: { description: 'első mentés' },
      actor: '36',
      clock,
    })
    await expect(firstUpdate).resolves.toMatchObject({ version: 2 })

    // Másik szerkesztő elavult verzióval ment:
    await expect(
      updateWithOptimisticLock({
        db,
        entityType: 'video',
        entityId: videoRow.id,
        expectedVersion: videoRow.version,
        changes: { description: 'elavult mentés' },
        actor: '37',
        clock,
      }),
    ).rejects.toBeInstanceOf(StaleWriteError)

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, videoRow.id))
    expect(audits).toHaveLength(1)
    const audit = audits.at(0)
    expect(audit).toBeDefined()
    if (audit === undefined) return
    expect(audit.actor).toBe('36')
    expect(audit.beforeValue).toMatchObject({ description: null })
    expect(audit.afterValue).toMatchObject({
      description: 'első mentés',
      version: 2,
    })
  })

  it('updatedBy csak valós tag esetén töltődik; system szereplőnél NULL', async () => {
    const db = await setupDb()
    const videoRow = await seedVideo(db)

    await updateWithOptimisticLock({
      db,
      entityType: 'video',
      entityId: videoRow.id,
      expectedVersion: 1,
      changes: { title: 'Rendszer által módosított cím' },
      actor: SYSTEM_ACTOR,
      clock,
    })
    const afterSystem = (
      await db.select().from(videos).where(eq(videos.id, videoRow.id))
    )[0]
    expect(afterSystem.updatedBy).toBeNull()
    expect(afterSystem.version).toBe(2)

    await updateWithOptimisticLock({
      db,
      entityType: 'video',
      entityId: videoRow.id,
      expectedVersion: 2,
      changes: { title: 'Tag által módosított cím' },
      actor: '36',
      clock,
    })
    const afterMember = (
      await db.select().from(videos).where(eq(videos.id, videoRow.id))
    )[0]
    expect(afterMember.updatedBy).toBe('36')
  })

  it('nem létező entitásnál érthető hiba jön', async () => {
    const db = await setupDb()
    await expect(
      updateWithOptimisticLock({
        db,
        entityType: 'video',
        entityId: '00000000-0000-4000-8000-000000000000',
        expectedVersion: 1,
        changes: {},
        actor: SYSTEM_ACTOR,
        clock,
      }),
    ).rejects.toBeInstanceOf(EntityNotFoundError)
  })

  it('sikertelen tranzakció nem hagy auditot vagy félkész adatot', async () => {
    const db = await setupDb()
    const beforeCount = await countAudits(db)
    const videoRow = await seedVideo(db)

    await expect(
      db.transaction(async (tx) => {
        await updateWithOptimisticLock.call(undefined, {
          // tx-et adunk át db-ként: a segéd belső transaction-e egymásba ágyazódik
          db: tx,
          entityType: 'video',
          entityId: videoRow.id,
          expectedVersion: videoRow.version,
          changes: { title: 'tranzakcióban mentett cím' },
          actor: '36',
          clock,
        })
        throw new Error('szándékos hiba a tranzakcióban')
      }),
    ).rejects.toThrow('szándékos hiba')

    const rowAfter = (
      await db.select().from(videos).where(eq(videos.id, videoRow.id))
    )[0]
    expect(rowAfter.title).toBe('Seed videó')
    expect(rowAfter.version).toBe(videoRow.version)
    expect(await countAudits(db)).toBe(beforeCount)
  })

  it('az auditnapló DB-szinten nem módosítható és nem törölhető', async () => {
    const db = await setupDb()
    const client = (db as unknown as { $client: Pool }).$client
    await client.query(
      "insert into audit_log (actor, entity_type, entity_id, action) values ('system','teszt','e1','update')",
    )
    await expect(
      client.query("delete from audit_log where entity_type='teszt'"),
    ).rejects.toThrow(/auditnapló/)
    await expect(
      client.query(
        "update audit_log set action='tampered' where entity_type='teszt'",
      ),
    ).rejects.toThrow(/auditnapló/)
  })
})

async function countAudits(
  db: NodePgDatabase<Record<string, never>>,
): Promise<number> {
  const result = await (db as unknown as { $client: Pool }).$client.query<{
    c: number
  }>('select count(*)::int as c from audit_log')
  return result.rows[0]?.c ?? 0
}

describe('BSS-009: plain text és hosszvalidáció', () => {
  it('a korlátok a specifikáció szerintiek', () => {
    expect(TEXT_LIMITS.title).toBe(200)
    expect(TEXT_LIMITS.slug).toBe(200)
    expect(TEXT_LIMITS.tagOrRole).toBe(64)
    expect(TEXT_LIMITS.description).toBe(10_000)
    expect(TEXT_LIMITS.guestsOrSongs).toBe(5_000)
    expect(TEXT_LIMITS.url).toBe(2_048)
  })

  it('túllépés és kötelező mező magyar hibával blokkol', () => {
    expect(() => validateRequiredText('Cím', '', TEXT_LIMITS.title)).toThrow(
      TextValidationError,
    )
    expect(() =>
      validatePlainText(
        'Leírás',
        'x'.repeat(TEXT_LIMITS.description + 1),
        TEXT_LIMITS.description,
      ),
    ).toThrow(/legfeljebb/)
  })

  it('opcionális üres mező nullát ad', () => {
    expect(
      validatePlainText('Zene', null, TEXT_LIMITS.guestsOrSongs),
    ).toBeNull()
    expect(
      validatePlainText('Zene', '  ', TEXT_LIMITS.guestsOrSongs),
    ).toBeNull()
  })

  it('vezérlőkarakter nem megengedett', () => {
    expect(() =>
      validatePlainText('Leírás', 'rossz\u0000szöveg', TEXT_LIMITS.description),
    ).toThrow(/vezérlőkarakter/)
  })
})
