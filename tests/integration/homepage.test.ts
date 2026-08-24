import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import {
  createLiveSchedule,
  deleteScheduledLive,
  endLiveNow,
  rescheduleLive,
  startLiveNow,
  transitionLiveStates,
  LiveOverlapError,
} from '#/server/homepage/live.ts'
import { setHighlightedVideo } from '#/server/homepage/highlight.ts'
import { getAboutPageVideos, setAboutVideos } from '#/server/homepage/about.ts'
import { getHomepageState, getUpcomingLive } from '#/server/homepage/state.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { FakeClock } from '#/lib/clock.ts'
import {
  auditLog,
  events,
  liveStreams,
  memberCache,
  videos,
} from '#/db/schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'
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
const clock = new FakeClock('2026-07-01T12:00:00.000Z')

const leaderViewer: Viewer = {
  level: 'leadership',
  sub: 'leader-sub',
  username: 'vezetoseg',
}
const memberViewer: Viewer = {
  level: 'member',
  sub: 'member-sub',
  username: 'tag',
}

async function setupDb(): Promise<NodePgDatabase<Record<string, never>>> {
  const migrated = await createMigratedTestDatabase('bss_homepage')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  await migrated.db.insert(memberCache).values([
    {
      sub: 'leader-sub',
      username: 'vezetoseg',
      fullName: 'Vezetőségi Tag',
      membershipStatus: 'studio_member',
    },
    {
      sub: 'member-sub',
      username: 'tag',
      fullName: 'BSS Tag',
      membershipStatus: 'studio_member',
    },
  ])
  return migrated.db
}

const okOembedRoutes = [
  {
    method: 'GET',
    urlPattern: /youtube\.com\/oembed/,
    respond: () => ({ status: 200, body: { title: 'Teszt live' } }),
  },
]

function oembedFailureRoutes() {
  return [
    {
      method: 'GET',
      urlPattern: /youtube\.com\/oembed/,
      respond: () => ({ status: 404 }),
    },
  ]
}

async function seedPublicVideo(
  db: NodePgDatabase<Record<string, never>>,
  slug: string,
  overrides: Partial<typeof videos.$inferInsert> = {},
): Promise<typeof videos.$inferSelect> {
  const rows = await db
    .insert(videos)
    .values({
      slug,
      title: slug,
      status: 'published',
      visibility: 'public',
      publishedAt: clock.now(),
      videoUrl: 'https://v.bsstudio.hu/v.mp4',
      thumbnailUrl: 'https://v.bsstudio.hu/t.jpg',
      ...overrides,
    })
    .returning()
  const row = rows.at(0)
  if (row === undefined) throw new Error('seed failed')
  return row
}

describe.skipIf(!hasTestDatabase)('BSS-017: live ütemezés', () => {
  it('létrehozás normalizál és oEmbed ellenőriz; tag tiltott', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okOembedRoutes)
    try {
      const stream = await createLiveSchedule(
        db,
        { viewer: leaderViewer, clock },
        {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          startsAt: new Date('2026-08-01T18:00:00.000Z'),
          endsAt: new Date('2026-08-01T20:00:00.000Z'),
        },
      )
      expect(stream.youtubeVideoId).toBe('dQw4w9WgXcQ')
      expect(stream.status).toBe('scheduled')

      await expect(
        createLiveSchedule(
          db,
          { viewer: memberViewer, clock },
          {
            youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
            startsAt: new Date('2026-09-01T18:00:00.000Z'),
            endsAt: new Date('2026-09-01T20:00:00.000Z'),
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError)
    } finally {
      mock.restore()
    }
  })

  it('átfedő időablak nem menthető — alkalmazás és DB korlát egyaránt', async () => {
    const db = await setupDb()
    const mock = installFetchMock(okOembedRoutes)
    try {
      await createLiveSchedule(
        db,
        { viewer: leaderViewer, clock },
        {
          youtubeUrl: 'https://youtu.be/aaaaaaaaaaa',
          startsAt: new Date('2026-08-02T18:00:00.000Z'),
          endsAt: new Date('2026-08-02T21:00:00.000Z'),
        },
      )

      // Teljes átfedés:
      await expect(
        createLiveSchedule(
          db,
          { viewer: leaderViewer, clock },
          {
            youtubeUrl: 'https://youtu.be/bbbbbbbbbbb',
            startsAt: new Date('2026-08-02T19:00:00.000Z'),
            endsAt: new Date('2026-08-02T22:00:00.000Z'),
          },
        ),
      ).rejects.toBeInstanceOf(LiveOverlapError)

      // A DB EXCLUDE korlát is tiltja (alkalmazásellenőrzés megkerülésével):
      try {
        await db.insert(liveStreams).values({
          youtubeVideoId: 'ccccccccccc',
          startsAt: new Date('2026-08-02T20:30:00.000Z'),
          endsAt: new Date('2026-08-02T23:00:00.000Z'),
        })
        throw new Error('átfedő live beszúródott')
      } catch (error) {
        const err = error as {
          constraint?: string
          cause?: { constraint?: string }
        }
        const constraint = err.constraint ?? err.cause?.constraint
        expect(constraint).toBe('live_streams_no_overlap_excl')
      }
    } finally {
      mock.restore()
    }
  })

  it('Indítás most aktivál; oEmbed hibánál fallback és rögzített hiba', async () => {
    const db = await setupDb()
    const okMock = installFetchMock(okOembedRoutes)
    let stream
    try {
      stream = await createLiveSchedule(
        db,
        { viewer: leaderViewer, clock },
        {
          youtubeUrl: 'https://youtu.be/ddddddddddd',
          startsAt: new Date('2026-08-03T18:00:00.000Z'),
          endsAt: new Date('2026-08-03T20:00:00.000Z'),
        },
      )
    } finally {
      okMock.restore()
    }

    // Hibás aktiválás:
    const failMock = installFetchMock(oembedFailureRoutes())
    try {
      const failed = await startLiveNow(
        db,
        { viewer: leaderViewer, clock },
        stream.id,
      )
      expect(failed.activated).toBe(false)
      expect(failed.stream.activationError).toMatch(/oEmbed|elérhető/)
      expect(
        (
          await db
            .select()
            .from(liveStreams)
            .where(eq(liveStreams.id, stream.id))
        ).at(0)?.status,
      ).toBe('scheduled')
    } finally {
      failMock.restore()
    }

    // Sikeres aktiválás:
    const okMock2 = installFetchMock(okOembedRoutes)
    try {
      const started = await startLiveNow(
        db,
        { viewer: leaderViewer, clock },
        stream.id,
      )
      expect(started.activated).toBe(true)
      expect(started.stream.status).toBe('active')
      expect(started.stream.activationError).toBeNull()
    } finally {
      okMock2.restore()
    }
  })

  it('Lezárás most befejezi; befejezett live csak admin előzmény, nem módosítható', async () => {
    const db = await setupDb()
    const okMock = installFetchMock(okOembedRoutes)
    let stream
    try {
      stream = await createLiveSchedule(
        db,
        { viewer: leaderViewer, clock },
        {
          youtubeUrl: 'https://youtu.be/eeeeeeeeeee',
          startsAt: new Date('2026-08-04T18:00:00.000Z'),
          endsAt: new Date('2026-08-04T20:00:00.000Z'),
        },
      )
    } finally {
      okMock.restore()
    }
    await endLiveNow(db, { viewer: leaderViewer, clock }, stream.id)

    const ended = (
      await db.select().from(liveStreams).where(eq(liveStreams.id, stream.id))
    ).at(0)
    expect(ended?.status).toBe('ended')
    expect(ended?.endedAt).not.toBeNull()

    await expect(
      rescheduleLive(db, { viewer: leaderViewer, clock }, stream.id, {
        startsAt: new Date('2027-01-01T10:00:00.000Z'),
        endsAt: new Date('2027-01-01T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/másolatként/)

    await expect(
      deleteScheduledLive(db, { viewer: leaderViewer, clock }, stream.id),
    ).rejects.toThrow(/Csak ütemezett/)
  })

  it('háttérfeladat aktiválja a lejárt ütemezést és bezárja a lefutottat — system audit', async () => {
    const db = await setupDb()
    await db.insert(liveStreams).values([
      {
        youtubeVideoId: 'fffffffffff',
        startsAt: new Date('2026-07-01T11:00:00.000Z'),
        endsAt: new Date('2026-07-01T15:00:00.000Z'),
      },
      {
        youtubeVideoId: 'ggggggggggg',
        startsAt: new Date('2026-07-01T09:00:00.000Z'),
        endsAt: new Date('2026-07-01T10:00:00.000Z'),
        status: 'active',
        activatedAt: new Date('2026-07-01T09:00:00.000Z'),
      },
    ])

    const result = await transitionLiveStates(db, { now: clock.now() })
    expect(result.activated).toBe(1)
    expect(result.ended).toBeGreaterThanOrEqual(1)

    const streams = await db.select().from(liveStreams)
    const byId = new Map(streams.map((s) => [s.youtubeVideoId, s]))
    expect(byId.get('fffffffffff')?.status).toBe('active')
    expect(byId.get('ggggggggggg')?.status).toBe('ended')

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, 'live_stream'))
    const systemAudits = audits.filter((a) => a.actor === 'system')
    expect(systemAudits.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!hasTestDatabase)(
  'BSS-017: kiemelés és homepage prioritás',
  () => {
    it('kiemelni csak publikált publikus videót lehet; tag tiltott', async () => {
      const db = await setupDb()
      const draft = await seedPublicVideo(db, 'kiemelt-draft', {
        status: 'draft',
        publishedAt: null,
      })
      await expect(
        setHighlightedVideo(db, {
          viewer: leaderViewer,
          videoId: draft.id,
          clock,
        }),
      ).rejects.toThrow(/publikált, publikus/)
      await expect(
        setHighlightedVideo(db, { viewer: memberViewer, videoId: null, clock }),
      ).rejects.toBeInstanceOf(ForbiddenError)

      const okVideo = await seedPublicVideo(db, 'kiemelt-ok')
      await setHighlightedVideo(db, {
        viewer: leaderViewer,
        videoId: okVideo.id,
        clock,
      })
    })

    it('aktív live felülírja a kiemelést; kiemelt felülírja a normált; hero nem ismétlődik', async () => {
      const db = await setupDb()
      const highlight = await seedPublicVideo(db, 'hero-kiemelt')
      const other = await seedPublicVideo(db, 'hero-oldal-1')
      void other

      // Normál → kiemelt:
      let state = await getHomepageState(db, { now: clock.now() })
      expect(state.priority).toBe('normal')

      await setHighlightedVideo(db, {
        viewer: leaderViewer,
        videoId: highlight.id,
        clock,
      })
      state = await getHomepageState(db, { now: clock.now() })
      expect(state.priority).toBe('highlight')
      expect(state.heroVideo?.id).toBe(highlight.id)
      expect(state.sideVideos.map((v) => v.id)).not.toContain(highlight.id)
      expect(state.sideVideos.length).toBeLessThanOrEqual(6)

      // Aktív live:
      await db.insert(liveStreams).values({
        youtubeVideoId: 'hhhhhhhhhhh',
        startsAt: new Date('2026-07-01T11:00:00.000Z'),
        endsAt: new Date('2026-07-01T13:00:00.000Z'),
        status: 'active',
        activatedAt: new Date('2026-07-01T11:00:00.000Z'),
      })
      state = await getHomepageState(db, { now: clock.now() })
      expect(state.priority).toBe('live')
      expect(state.liveEmbedUrl).toContain(
        'youtube-nocookie.com/embed/hhhhhhhhhhh',
      )
    })

    it('Adás hamarosan sáv: 24 órán belüli ütemezésnél jelenik meg, hero marad', async () => {
      const db = await setupDb()
      const soonStart = new Date(clock.now().getTime() + 60 * 60 * 1000)
      await db.insert(liveStreams).values({
        youtubeVideoId: 'iiiiiiiiiii',
        startsAt: soonStart,
        endsAt: new Date(soonStart.getTime() + 2 * 60 * 60 * 1000),
      })

      const upcoming = await getUpcomingLive(db, { now: clock.now() })
      expect(upcoming?.stream.youtubeVideoId).toBe('iiiiiiiiiii')

      const farStart = new Date(clock.now().getTime() + 48 * 60 * 60 * 1000)
      await db.insert(liveStreams).values({
        youtubeVideoId: 'jjjjjjjjjjj',
        startsAt: farStart,
        endsAt: new Date(farStart.getTime() + 2 * 60 * 60 * 1000),
      })

      const state = await getHomepageState(db, { now: clock.now() })
      expect(state.upcomingLive?.embedUrl).toContain('iiiiiiiiiii')
    })
  },
)

describe.skipIf(!hasTestDatabase)('BSS-017: Rólunk-videók', () => {
  it('legfeljebb hat rendezett publikus videó; érvénytelen automatikusan kiesik', async () => {
    const db = await setupDb()
    const v1 = await seedPublicVideo(db, 'rolunk-1')
    const v2 = await seedPublicVideo(db, 'rolunk-2')
    const archived = await seedPublicVideo(db, 'rolunk-archived', {
      status: 'archived',
    })

    // Érvénytelen (archivált) videóval a beállítás hibát ad:
    await expect(
      setAboutVideos(db, {
        viewer: leaderViewer,
        orderedVideoIds: [v1.id, archived.id, v2.id],
        clock,
      }),
    ).rejects.toThrow(/publikált, publikus/)

    await setAboutVideos(db, {
      viewer: leaderViewer,
      orderedVideoIds: [v1.id, v2.id],
      clock,
    })

    const listed = await getAboutPageVideos(db)
    for (const video of listed) {
      expect(video.status).toBe('published')
      expect(video.visibility).toBe('public')
    }
    expect(listed.map((v) => v.slug)).toEqual(['rolunk-1', 'rolunk-2'])

    // Hét videó nem fér rá:
    const manyIds: string[] = []
    for (let i = 0; i < 7; i += 1) {
      manyIds.push((await seedPublicVideo(db, `rolunk-extra-${i}`)).id)
    }
    await expect(
      setAboutVideos(db, {
        viewer: leaderViewer,
        orderedVideoIds: manyIds,
        clock,
      }),
    ).rejects.toThrow(/Legfeljebb hat|Legfeljebb 6/)
  })

  it('eseménylista: hat legutóbbi publikált esemény kezdődátum szerint csökkenőben', async () => {
    const db = await setupDb()
    for (let i = 1; i <= 8; i += 1) {
      await db.insert(events).values({
        slug: `home-esemeny-${i}`,
        title: `Esemény ${i}`,
        startDate: `2026-06-${String(i + 10).padStart(2, '0')}`,
        status: 'published',
      })
    }
    const state = await getHomepageState(db, { now: clock.now() })
    expect(state.events).toHaveLength(6)
    expect(state.events[0]?.slug).toBe('home-esemeny-8')
  })
})
