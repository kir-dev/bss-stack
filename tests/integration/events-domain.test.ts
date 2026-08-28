import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import {
  archiveEvent,
  createEvent,
  getEventBySlug,
  listEvents,
  permanentlyDeleteEvent,
  publishEvent,
  updateEvent,
  EventConfirmationError,
} from '#/server/events/domain.ts'
import { findFreeSlug } from '#/server/shared/slug.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { StaleWriteError } from '#/server/shared/write.ts'
import { TextValidationError } from '#/server/shared/text.ts'
import { FakeClock } from '#/lib/clock.ts'
import { auditLog, events, memberCache, videos } from '#/db/schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'
import { installFetchMock } from '../helpers/http-mock.ts'
import { DEFAULT_MEDIA_CONFIG } from '#/server/media/validator.ts'

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
const clock = new FakeClock('2026-06-15T10:00:00.000Z')

const mediaConfig = DEFAULT_MEDIA_CONFIG

const memberViewer: Viewer = {
  level: 'member',
  sub: 'member-sub',
  username: 'tag',
}
const leaderViewer: Viewer = {
  level: 'leadership',
  sub: 'leader-sub',
  username: 'vezetoseg',
}
const schonherzViewer: Viewer = {
  level: 'schonherz',
  sub: null,
  username: null,
}

function deps(viewer: Viewer) {
  return { viewer, clock, mediaConfig }
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_events')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  await migrated.db.insert(memberCache).values([
    {
      sub: 'member-sub',
      username: 'tag',
      fullName: 'BSS Tag',
      membershipStatus: 'studio_member',
    },
    {
      sub: 'leader-sub',
      username: 'vezetoseg',
      fullName: 'Vezetőségi Tag',
      membershipStatus: 'studio_member',
    },
  ])
  return migrated.db
}

describe.skipIf(!hasTestDatabase)(
  'BSS-013: esemény létrehozás és publikálás',
  () => {
    it('piszkozat csak címmel jön létre, slug a címből képződik', async () => {
      const db = await setupDb()
      const event = await createEvent(db, deps(memberViewer), {
        title: 'Őszi Tábor – Főpróba!',
      })
      expect(event.status).toBe('draft')
      expect(event.slug).toBe('oszi-tabor-foproba')
      expect(event.startDate).toBeNull()

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, event.id))
      expect(audits.map((a) => a.action)).toEqual(['create'])
    })

    it('schönherzes és névtelen nem hozhat létre eseményt', async () => {
      const db = await setupDb()
      await expect(
        createEvent(db, deps(schonherzViewer), { title: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('publikáláshoz kezdődátum kell; jövőbeli esemény publikálható', async () => {
      const db = await setupDb()
      const event = await createEvent(db, deps(memberViewer), {
        title: 'Fesztivál',
      })

      await expect(
        publishEvent(db, deps(memberViewer), event.id, event.version),
      ).rejects.toThrow(/Kezdődátum/)

      const updated = await updateEvent(
        db,
        deps(memberViewer),
        event.id,
        event.version,
        {
          startDate: '2027-08-01',
          endDate: '2027-08-05',
        },
      )
      const published = await publishEvent(
        db,
        deps(memberViewer),
        updated.id,
        updated.version,
      )
      expect(published.status).toBe('published')

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, event.id))
      expect(audits.map((a) => a.action)).toContain('publish')
    })

    it('a befejezés nem előzheti meg a kezdést', async () => {
      const db = await setupDb()
      const event = await createEvent(db, deps(memberViewer), {
        title: 'Hibás intervallum',
      })
      await expect(
        updateEvent(db, deps(memberViewer), event.id, event.version, {
          startDate: '2026-07-10',
          endDate: '2026-07-01',
        }),
      ).rejects.toThrow(/korábbi a kezdésnél/)
    })

    it('érvénytelen thumbnail host piszkozatban sem menthető', async () => {
      const db = await setupDb()
      const event = await createEvent(db, deps(memberViewer), {
        title: 'Média',
      })
      await expect(
        updateEvent(db, deps(memberViewer), event.id, event.version, {
          thumbnailUrl: 'https://masik-host.hu/kep.jpg',
        }),
      ).rejects.toBeInstanceOf(TextValidationError)
    })

    it('publikáláskor az elérhetetlen thumbnail blokkol, a jó átmegy', async () => {
      const db = await setupDb()
      const mock = installFetchMock([
        {
          method: 'HEAD',
          urlPattern: /hibas-media\.jpg/,
          respond: () => ({ status: 404 }),
        },
        {
          method: 'HEAD',
          urlPattern: /jo-media\.jpg/,
          respond: () => ({
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          }),
        },
      ])

      try {
        const bad = await createEvent(db, deps(memberViewer), {
          title: 'Rossz média',
        })
        const badWithThumb = await updateEvent(
          db,
          deps(memberViewer),
          bad.id,
          bad.version,
          {
            startDate: '2026-07-01',
            thumbnailUrl: 'https://v.bsstudio.hu/hibas-media.jpg',
          },
        )
        await expect(
          publishEvent(
            db,
            deps(memberViewer),
            badWithThumb.id,
            badWithThumb.version,
          ),
        ).rejects.toThrow(/nem érhető el/)

        const good = await createEvent(db, deps(memberViewer), {
          title: 'Jó média',
        })
        const goodWithThumb = await updateEvent(
          db,
          deps(memberViewer),
          good.id,
          good.version,
          {
            startDate: '2026-07-02',
            thumbnailUrl: 'https://v.bsstudio.hu/jo-media.jpg',
          },
        )
        const published = await publishEvent(
          db,
          deps(memberViewer),
          goodWithThumb.id,
          goodWithThumb.version,
        )
        expect(published.status).toBe('published')
      } finally {
        mock.restore()
      }
    })

    it('archiválás után újra publikálható', async () => {
      const db = await setupDb()
      const created = await createEvent(db, deps(memberViewer), {
        title: 'Archivált',
        startDate: '2025-05-01',
      })
      const published = await publishEvent(
        db,
        deps(memberViewer),
        created.id,
        created.version,
      )
      const archived = await archiveEvent(
        db,
        deps(memberViewer),
        published.id,
        published.version,
      )
      expect(archived.status).toBe('archived')
      const republished = await publishEvent(
        db,
        deps(memberViewer),
        archived.id,
        archived.version,
      )
      expect(republished.status).toBe('published')
    })

    it('elavult verziójú mentés StaleWriteError-t kap', async () => {
      const db = await setupDb()
      const event = await createEvent(db, deps(memberViewer), { title: 'Első' })
      const second = await updateEvent(
        db,
        deps(memberViewer),
        event.id,
        event.version,
        {
          description: 'módosítás',
        },
      )
      await expect(
        updateEvent(db, deps(memberViewer), second.id, event.version, {
          description: 'elavult',
        }),
      ).rejects.toBeInstanceOf(StaleWriteError)
    })

    it('slug módosítás átirányítási előzménnyel történik', async () => {
      const db = await setupDb()
      const event = await createEvent(db, deps(memberViewer), {
        title: 'Slug teszt',
      })
      const updated = await updateEvent(
        db,
        deps(memberViewer),
        event.id,
        event.version,
        {
          slug: 'uj-slug-nev',
        },
      )
      expect(updated.slug).toBe('uj-slug-nev')
      const redirect = await getEventBySlug(db, 'uj-slug-nev')
      expect(redirect?.id).toBe(event.id)

      // A régi slug le van foglalva a történetben.
      const free = await findFreeSlug(db, 'event', 'slug-teszt')
      expect(free).not.toBe('slug-teszt')
    })

    it('lista kezdődátum szerint csökkenő sorrendű és lapozható', async () => {
      const db = await setupDb()
      await createEvent(db, deps(memberViewer), {
        title: 'Korai',
        startDate: '2024-01-01',
      })
      await createEvent(db, deps(memberViewer), {
        title: 'Késői',
        startDate: '2026-02-02',
      })
      await createEvent(db, deps(memberViewer), {
        title: 'Középső',
        startDate: '2025-06-06',
      })

      const page = await listEvents(db, { limit: 2 })
      expect(page.items.map((e) => e.title)).toEqual(['Késői', 'Középső'])
      expect(page.total).toBeGreaterThanOrEqual(3)
      const nextPage = await listEvents(db, { limit: 2, offset: 2 })
      expect(nextPage.items.at(0)?.title).toBe('Korai')
    })
  },
)

describe.skipIf(!hasTestDatabase)('BSS-013: végleges törlés', () => {
  it('tag nem törölhet végleg; vezetőség címbeírással igen — egy tranzakcióban', async () => {
    const db = await setupDb()
    const event = await createEvent(db, deps(memberViewer), {
      title: 'Törlendő Esemény',
      startDate: '2026-03-03',
      endDate: '2026-03-05',
    })
    const videoRows = await db
      .insert(videos)
      .values([
        {
          slug: 't-esemeny-video-1',
          title: 'V1',
          eventId: event.id,
          recordedAt: '2026-03-04',
          status: 'published',
          publishedAt: clock.now(),
        },
        {
          slug: 't-esemeny-video-2',
          title: 'V2',
          eventId: event.id,
          recordedAt: null,
        },
      ])
      .returning()

    // Tag végleges törlése tiltott:
    await expect(
      permanentlyDeleteEvent(
        db,
        deps(memberViewer),
        event.id,
        'Törlendő Esemény',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError)

    // Vezetőség rossz megerősítése blokkol:
    await expect(
      permanentlyDeleteEvent(db, deps(leaderViewer), event.id, 'rossz cím'),
    ).rejects.toBeInstanceOf(EventConfirmationError)
    const stillThere = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id))
    expect(stillThere).toHaveLength(1)

    const result = await permanentlyDeleteEvent(
      db,
      deps(leaderViewer),
      event.id,
      'Törlendő Esemény',
    )
    expect(result.detachedVideoIds).toHaveLength(2)

    // Az esemény eltűnt, de a videók megmaradnak `recordedAt`-tal, kapcsolat nélkül:
    const remainingEvents = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id))
    expect(remainingEvents).toHaveLength(0)
    for (const video of videoRows) {
      const after = (
        await db.select().from(videos).where(eq(videos.id, video.id))
      ).at(0)
      expect(after?.eventId).toBeNull()
      expect(after?.recordedAt).toBe(video.recordedAt)
    }

    // Teljes audit egyetlen törlési bejegyzéssel, leválasztott videókkal:
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, event.id))
    const deleteAudit = audits.find((a) => a.action === 'delete_permanent')
    expect(deleteAudit).toBeDefined()
    expect(deleteAudit?.beforeValue).toMatchObject({
      title: 'Törlendő Esemény',
      detachedVideoIds: result.detachedVideoIds,
    })

    // A régi slug örökre foglalt:
    await expect(
      findFreeSlug(db, 'event', 'torlendo-esemeny'),
    ).resolves.not.toBe('torlendo-esemeny')
  })

  it('félkész állapot nem maradhat: hibás tranzakció visszagörget', async () => {
    const db = await setupDb()
    const event = await createEvent(db, deps(memberViewer), {
      title: 'Rollback esemény',
      startDate: '2026-04-04',
    })
    await db
      .insert(videos)
      .values({ slug: 'rollback-video', title: 'RV', eventId: event.id })

    await expect(
      db.transaction(async (tx) => {
        await permanentlyDeleteEvent.call(
          undefined,
          tx,
          deps(leaderViewer),
          event.id,
          'Rollback esemény',
        )
        throw new Error('szándékos hiba')
      }),
    ).rejects.toThrow('szándékos hiba')

    const stillThere = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id))
    expect(stillThere).toHaveLength(1)
    const linkedVideos = await db
      .select()
      .from(videos)
      .where(eq(videos.eventId, event.id))
    expect(linkedVideos).toHaveLength(1)
  })
})
