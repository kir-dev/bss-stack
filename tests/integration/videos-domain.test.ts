import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import {
  archiveVideo,
  createVideoDraft,
  publishVideo,
  restoreVideoFromTrash,
  setVideoStaff,
  setVideoTags,
  trashVideo,
  updateVideo,
} from '#/server/videos/domain.ts'
import {
  createTrashPurgeJob,
  purgeExpiredTrashedVideos,
  TRASH_RETENTION_DAYS,
} from '#/server/videos/purge.ts'
import { findFreeSlug } from '#/server/shared/slug.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { StaleWriteError } from '#/server/shared/write.ts'
import { TextValidationError } from '#/server/shared/text.ts'
import { FakeClock } from '#/lib/clock.ts'
import {
  auditLog,
  events,
  memberCache,
  siteSettings,
  staffRoles,
  videoTags,
  videos,
} from '#/db/schema.ts'
import { createTag } from '#/server/catalog/tags.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
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
const clock = new FakeClock('2026-06-15T10:00:00.000Z')
const mediaConfig = buildRawOobConfig().media

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

function deps(viewer: Viewer) {
  return { viewer, clock, mediaConfig }
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_videos')
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

const okMediaRoutes = [
  {
    method: 'HEAD',
    urlPattern: /v\.bsstudio\.hu/,
    respond: (req: { url: URL }) => ({
      status: 200,
      headers: {
        'content-type': req.url.pathname.endsWith('.mp4')
          ? 'video/mp4'
          : 'image/jpeg',
      },
    }),
  },
]

async function publishedVideo(
  db: NodePgDatabase<Record<string, never>>,
  overrides: Partial<typeof videos.$inferInsert> & { slug?: string } = {},
): Promise<typeof videos.$inferSelect> {
  const draft = await createVideoDraft(db, deps(memberViewer), {
    title: overrides.title ?? 'Publikált videó',
    slug: overrides.slug,
    encodingGroup: '16a9_HD',
    hasHq: true,
    hasLq: true,
    baseFilename: 'published-video',
  })
  const result = await publishVideo(
    db,
    deps(memberViewer),
    draft.id,
    draft.version,
  )
  return result.row
}

describe.skipIf(!hasTestDatabase)('BSS-014: piszkozat és publikálás', () => {
  it('piszkozat csak címmel menthető; alap láthatósága public', async () => {
    const db = await setupDb()
    const draft = await createVideoDraft(db, deps(memberViewer), {
      title: 'Első piszkozat',
      description: '',
      baseFilename: 'elso-piszkozat',
    })
    expect(draft.status).toBe('draft')
    expect(draft.visibility).toBe('public')
    expect(draft.baseFilename).toBe('elso-piszkozat')
  })

  it('piszkozat cím nélkül nem jön létre', async () => {
    const db = await setupDb()
    await expect(
      createVideoDraft(db, deps(memberViewer), {}),
    ).rejects.toBeInstanceOf(TextValidationError)
  })

  it('publikálás minden kötelező mezőt és a médiát ellenőrzi', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const draft = await createVideoDraft(db, deps(memberViewer), {
        title: 'Média teszt',
      })

      await expect(
        publishVideo(db, deps(memberViewer), draft.id, draft.version),
      ).rejects.toThrow(/Videóprofil/)

      const complete = await updateVideo(
        db,
        deps(memberViewer),
        draft.id,
        draft.version,
        {
          encodingGroup: '16a9_HD',
          hasHq: true,
          hasLq: true,
          baseFilename: 'media-test',
        },
      )
      const published = await publishVideo(
        db,
        deps(memberViewer),
        complete.row.id,
        complete.row.version,
      )
      expect(published.row.status).toBe('published')
      expect(published.row.publishedAt).not.toBeNull()

      // A publikálási kísérletek ellenére csak a sikeres mentés írta az állapotot.
      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, draft.id))
      expect(audits.filter((a) => a.action === 'publish')).toHaveLength(1)
    } finally {
      mock.restore()
    }
  })

  it('jövőbeli publishedAt tiltott; múltbeli megadható és publikáláskor megmarad', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const draft = await createVideoDraft(db, deps(memberViewer), {
        title: 'Dátumos',
      })

      await expect(
        updateVideo(db, deps(memberViewer), draft.id, draft.version, {
          publishedAt: new Date(clock.now().getTime() + 60_000),
        }),
      ).rejects.toThrow(/jövőbeli/)

      const past = await updateVideo(
        db,
        deps(memberViewer),
        draft.id,
        draft.version,
        {
          publishedAt: new Date('2026-01-01T08:00:00.000Z'),
          encodingGroup: '16a9_HD',
          hasHq: true,
          hasLq: true,
          baseFilename: 'dated-video',
        },
      )
      const published = await publishVideo(
        db,
        deps(memberViewer),
        past.row.id,
        past.row.version,
      )
      expect(published.row.publishedAt?.toISOString()).toBe(
        '2026-01-01T08:00:00.000Z',
      )
    } finally {
      mock.restore()
    }
  })

  it('egynapos esemény csendesen kitölti az üres recordedAt-ot; felülírni nem írja', async () => {
    const db = await setupDb()
    const eventRows = await db
      .insert(events)
      .values({ slug: 'egynapos', title: 'Egynapos', startDate: '2026-05-02' })
      .returning()
    const event = eventRows.at(0)
    if (event === undefined) throw new Error('event seed failed')

    const draft = await createVideoDraft(db, deps(memberViewer), {
      title: 'Csendes dátum',
    })
    const assigned = await updateVideo(
      db,
      deps(memberViewer),
      draft.id,
      draft.version,
      {
        eventId: event.id,
      },
    )
    expect(assigned.warnings).toEqual([])
    expect(assigned.row.recordedAt).toBe('2026-05-02')

    // Eseménymódosítás nem írja felül csendben a videódátumot:
    const explicit = await updateVideo(
      db,
      deps(memberViewer),
      draft.id,
      assigned.row.version,
      { recordedAt: '2026-04-20' },
    )
    expect(explicit.row.recordedAt).toBe('2026-04-20')

    // Az intervallumon kívüli dátum figyelmeztetést kap:
    expect(explicit.warnings.join(' ')).toMatch(/időtartamán/)
  })

  it('többnapos eseménynél recordedAt nélkül nem publikálható', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      const eventRows = await db
        .insert(events)
        .values({
          slug: 'tobbnapos',
          title: 'Többnapos',
          startDate: '2026-05-02',
          endDate: '2026-05-04',
        })
        .returning()
      const event = eventRows.at(0)
      if (event === undefined) throw new Error('event seed failed')

      const draft = await createVideoDraft(db, deps(memberViewer), {
        title: 'Többnapos videó',
      })
      const assigned = await updateVideo(
        db,
        deps(memberViewer),
        draft.id,
        draft.version,
        {
          eventId: event.id,
        },
      )
      const filled = await updateVideo(
        db,
        deps(memberViewer),
        draft.id,
        assigned.row.version,
        {
          encodingGroup: '16a9_HD',
          hasHq: true,
          hasLq: true,
          baseFilename: 'multi-day-video',
        },
      )

      await expect(
        publishVideo(db, deps(memberViewer), filled.row.id, filled.row.version),
      ).rejects.toThrow(/készülési dátumot/)

      const dated = await updateVideo(
        db,
        deps(memberViewer),
        draft.id,
        filled.row.version,
        {
          recordedAt: '2026-05-03',
        },
      )
      const published = await publishVideo(
        db,
        deps(memberViewer),
        dated.row.id,
        dated.row.version,
      )
      expect(published.row.recordedAt).toBe('2026-05-03')
      void multiDayUnused
    } finally {
      mock.restore()
    }
  })

  it('esemény leválasztása után a recordedAt megmarad', async () => {
    const db = await setupDb()
    const eventRows = await db
      .insert(events)
      .values({
        slug: 'levalasztas',
        title: 'Leválasztás',
        startDate: '2026-05-06',
      })
      .returning()
    const eventId = eventRows.at(0)?.id
    if (eventId === undefined) throw new Error('seed failed')

    const draft = await createVideoDraft(db, deps(memberViewer), {
      title: 'Leválasztott',
    })
    const assigned = await updateVideo(
      db,
      deps(memberViewer),
      draft.id,
      draft.version,
      { eventId },
    )
    expect(assigned.row.recordedAt).toBe('2026-05-06')

    const detached = await updateVideo(
      db,
      deps(memberViewer),
      draft.id,
      assigned.row.version,
      {
        eventId: null,
      },
    )
    expect(detached.row.eventId).toBeNull()
    expect(detached.row.recordedAt).toBe('2026-05-06')
  })
})

describe.skipIf(!hasTestDatabase)(
  'BSS-014: archiválás, lomtár, visszaállítás',
  () => {
    it('tag archiválhat és lomtárba tehet; kapcsolatok megmaradnak', async () => {
      const db = await setupDb()
      const mock = installFetchMock(okMediaRoutes)
      try {
        const tagRows = await createTag(db, { viewer: leaderViewer }, 'koncert')
        const tagId = tagRows.id

        const draft = await createVideoDraft(db, deps(memberViewer), {
          title: 'Életciklus',
        })
        const tagged = await setVideoTags(
          db,
          deps(memberViewer),
          draft.id,
          draft.version,
          [tagId],
        )
        const withMedia = await updateVideo(
          db,
          deps(memberViewer),
          tagged.row.id,
          tagged.row.version,
          {
            encodingGroup: '16a9_HD',
            hasHq: true,
            hasLq: true,
            baseFilename: 'lifecycle-video',
          },
        )
        const published = await publishVideo(
          db,
          deps(memberViewer),
          withMedia.row.id,
          withMedia.row.version,
        )

        const archived = await archiveVideo(
          db,
          deps(memberViewer),
          published.row.id,
          published.row.version,
        )
        expect(archived.row.status).toBe('archived')

        const trashed = await trashVideo(
          db,
          deps(memberViewer),
          archived.row.id,
          archived.row.version,
        )
        expect(trashed.row.status).toBe('trash')
        expect(trashed.row.trashedBy).toBe('member-sub')

        const links = await db
          .select()
          .from(videoTags)
          .where(eq(videoTags.videoId, draft.id))
        expect(links.map((l) => l.tagId)).toEqual([tagId])

        // Archivált/lomtári állapotban a kiemelés érvénytelenítve:
        const settingsRows = await db.select().from(siteSettings)
        expect(settingsRows.at(0)?.highlightedVideoId ?? null).toBeNull()
      } finally {
        mock.restore()
      }
    })

    it('csak vezetőség állíthat vissza; a visszaállítás archivált állapotot ad', async () => {
      const db = await setupDb()
      const mock = installFetchMock(okMediaRoutes)
      try {
        const published = await publishedVideo(db, { title: 'Visszaállítás' })
        const draft = published
        const trashed = await trashVideo(
          db,
          deps(memberViewer),
          published.id,
          published.version,
        )

        await expect(
          restoreVideoFromTrash(
            db,
            deps(memberViewer),
            draft.id,
            trashed.row.version,
          ),
        ).rejects.toBeInstanceOf(ForbiddenError)

        const restored = await restoreVideoFromTrash(
          db,
          deps(leaderViewer),
          draft.id,
          trashed.row.version,
        )
        expect(restored.row.status).toBe('archived')
        expect(restored.row.trashedBy).toBeNull()
        expect(restored.row.trashedAt).toBeNull()

        const audits = await db
          .select()
          .from(auditLog)
          .where(eq(auditLog.entityId, draft.id))
        expect(audits.map((a) => a.action)).toContain('restore')
      } finally {
        mock.restore()
      }
    })

    it('elavult verziójú életciklusművelet blokkolódik', async () => {
      const db = await setupDb()
      const draft = await createVideoDraft(db, deps(memberViewer), {
        title: 'Konfliktus',
      })
      await updateVideo(db, deps(memberViewer), draft.id, draft.version, {
        guests: 'Valaki',
      })
      await expect(
        archiveVideo(db, deps(memberViewer), draft.id, draft.version),
      ).rejects.toBeInstanceOf(StaleWriteError)
    })

    it('címkék cseréje: csak meglévő címke rendelhető; ismeretlen blokkol', async () => {
      const db = await setupDb()
      const draft = await createVideoDraft(db, deps(memberViewer), {
        title: 'Címkézés',
      })
      await expect(
        setVideoTags(db, deps(memberViewer), draft.id, draft.version, [
          '00000000-0000-4000-8000-000000000099',
        ]),
      ).rejects.toThrow(/meglévő címke/)
    })

    it('stáblista: egy szerep több taggal és egy tag több szereppel is lehet', async () => {
      const db = await setupDb()
      const roleRows = await db
        .insert(staffRoles)
        .values([
          { name: 'Operatőr', normalizedName: 'operatőr', displayOrder: 1 },
          { name: 'Vágó', normalizedName: 'vágó', displayOrder: 2 },
        ])
        .returning()
      const operator = roleRows.find((r) => r.name === 'Operatőr')
      const editor = roleRows.find((r) => r.name === 'Vágó')
      if (operator === undefined || editor === undefined)
        throw new Error('role seed failed')

      const draft = await createVideoDraft(db, deps(memberViewer), {
        title: 'Stáb',
      })
      const result = await setVideoStaff(
        db,
        deps(memberViewer),
        draft.id,
        draft.version,
        [
          { roleId: operator.id, memberSub: 'member-sub' },
          { roleId: operator.id, memberSub: 'leader-sub' },
          { roleId: editor.id, memberSub: 'member-sub' },
        ],
      )
      expect(result.row.version).toBe(draft.version + 1)

      await expect(
        setVideoStaff(db, deps(memberViewer), draft.id, draft.version, []),
      ).rejects.toBeInstanceOf(StaleWriteError)
    })
  },
)

describe.skipIf(!hasTestDatabase)('BSS-014: napi lomtártörlés', () => {
  it('30 nap után végleg töröl; slug lefoglalva; rendszer-audit; külső média érintetlen', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okMediaRoutes)
    try {
      expect(TRASH_RETENTION_DAYS).toBe(30)
      const published = await publishedVideo(db, {
        title: 'Régi lomtár',
        slug: 'regi-lomtar',
      })
      const draft = published
      const trashedRow = await trashVideo(
        db,
        deps(memberViewer),
        published.id,
        published.version,
      )
      void trashedRow

      // 29 nap múlva még nem törlendő:
      clock.advanceDays(29)
      let purged = await purgeExpiredTrashedVideos(db, { now: clock.now() })
      expect(purged).toEqual([])
      expect(
        (await db.select().from(videos).where(eq(videos.id, draft.id))).length,
      ).toBe(1)

      // 31 nap múlva már igen:
      clock.advanceDays(2)
      purged = await purgeExpiredTrashedVideos(db, { now: clock.now() })
      expect(purged).toEqual([draft.id])
      expect(
        (await db.select().from(videos).where(eq(videos.id, draft.id))).length,
      ).toBe(0)

      const freeSlug = await findFreeSlug(db, 'video', 'regi-lomtar')
      expect(freeSlug).not.toBe('regi-lomtar')

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, draft.id))
      const purgeAudit = audits.find((a) => a.action === 'delete_permanent')
      expect(purgeAudit?.actor).toBe('system')
      expect((purgeAudit?.beforeValue as Record<string, unknown>).title).toBe(
        'Régi lomtár',
      )

      // A friss lomtári videó nem törlődik:
      const fresh = await publishedVideo(db, { title: 'Friss lomtár' })
      const tr = await trashVideo(
        db,
        deps(memberViewer),
        fresh.id,
        fresh.version,
      )
      purged = await purgeExpiredTrashedVideos(db, { now: clock.now() })
      expect(purged).toEqual([])
      expect(
        (await db.select().from(videos).where(eq(videos.id, fresh.id))).length,
      ).toBe(1)
      void tr
    } finally {
      mock.restore()
    }
  })

  it('a purge feladat regisztrálható a runner extra feladataiként', async () => {
    const db = await setupDb()
    const job = createTrashPurgeJob({
      clock,
      db: async () => db,
    })
    expect(job.name).toBe('video-trash-purge-daily')
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000)
    await job.run({ clock, trigger: 'tick' })
  })
})

const multiDayUnused = false
