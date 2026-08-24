import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  jsonRequest,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import {
  handleAdminAboutRoute,
  handleAdminHighlightRoute,
  handleAdminLiveRoutes,
} from '#/server/api/admin/homepage-routes.ts'
import { getHomepageAdminData } from '#/server/admin/homepage-admin.ts'
import { liveStreams, siteSettings, videos } from '#/db/schema.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const OEMBED_OK = {
  title: 'Live stream',
  author_name: 'BSS',
  html: '<iframe></iframe>',
}

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

function deps(ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) {
  return { db: ctx.db, config: testConfig }
}

function oembedFetch(ok = true): typeof fetch {
  return async () =>
    new Response(JSON.stringify(OEMBED_OK), {
      status: ok ? 200 : 404,
      headers: { 'content-type': 'application/json' },
    })
}

describe.skipIf(!hasTestDatabase)('BSS-031: jogosultságok', () => {
  for (const [name, call] of [
    [
      'kiemelés',
      (ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) =>
        handleAdminHighlightRoute(
          jsonRequest(ctx.memberToken, '/api/admin/highlight', {
            videoId: null,
          }),
          deps(ctx),
        ),
    ],
    [
      'live létrehozás',
      (ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) =>
        handleAdminLiveRoutes(
          jsonRequest(ctx.memberToken, '/api/admin/live', {
            youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
            startsAt: '2026-09-01T10:00:00Z',
            endsAt: '2026-09-01T12:00:00Z',
          }),
          undefined,
          undefined,
          deps(ctx),
        ),
    ],
    [
      'Rólunk mentés',
      (ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) =>
        handleAdminAboutRoute(
          jsonRequest(ctx.memberToken, '/api/admin/about', {
            orderedVideoIds: [],
          }),
          deps(ctx),
        ),
    ],
  ] as const) {
    it(`tag nem hívhatja a ${name} műveletet`, async () => {
      const ctx = await setupAdminApiTest(`bss hp-${name.length}`)
      const response = await call(ctx)
      expect(response.status).toBe(403)
    })
  }

  it('névtelen 401-et kap belépési URL-lel', async () => {
    const ctx = await setupAdminApiTest('bss hpanon')
    const response = await handleAdminHighlightRoute(
      jsonRequest(null, '/api/admin/highlight', { videoId: null }),
      deps(ctx),
    )
    expect(response.status).toBe(401)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-031: kiemelés', () => {
  it('publikált publikus videó kiemelhető és levehető; nem publikus elutasítva', async () => {
    const ctx = await setupAdminApiTest('bss hphighlight')
    const publishedRows = await ctx.db
      .insert(videos)
      .values({
        slug: 'kiemelt-video',
        title: 'Kiemelendő',
        status: 'published',
        visibility: 'public',
        publishedAt: new Date('2026-01-01T10:00:00Z'),
      })
      .returning()
    const publishedId = publishedRows[0].id
    const draftRows = await ctx.db
      .insert(videos)
      .values({ slug: 'draft-video', title: 'Piszkozat' })
      .returning()

    // Nem publikált videó → 400 magyar üzenettel.
    const invalid = await handleAdminHighlightRoute(
      jsonRequest(ctx.leadershipToken, '/api/admin/highlight', {
        videoId: draftRows[0].id,
      }),
      deps(ctx),
    )
    const invalidBody = await responseBody(invalid)
    expect(invalidBody.status).toBe(400)
    expect(String(JSON.stringify(invalidBody.payload))).toContain(
      'Csak publikált',
    )

    // Érvényes kiemelés.
    const ok = await handleAdminHighlightRoute(
      jsonRequest(ctx.leadershipToken, '/api/admin/highlight', {
        videoId: publishedId,
      }),
      deps(ctx),
    )
    expect(ok.status).toBe(200)
    const settings = await ctx.db.select().from(siteSettings)
    expect(settings.at(0)?.highlightedVideoId).toBe(publishedId)

    // Eltávolítás.
    const removed = await handleAdminHighlightRoute(
      jsonRequest(ctx.leadershipToken, '/api/admin/highlight', {
        videoId: null,
      }),
      deps(ctx),
    )
    expect(removed.status).toBe(200)
    const settingsAfter = await ctx.db.select().from(siteSettings)
    expect(settingsAfter.at(0)?.highlightedVideoId).toBeNull()
  })
})

describe.skipIf(!hasTestDatabase)('BSS-031: live', () => {
  it('hibás YouTube URL nem menthető; érvényes igen; átfedés 409', async () => {
    const ctx = await setupAdminApiTest('bss hplive')
    const baseDeps = { ...deps(ctx), fetchImpl: oembedFetch(false) }

    // Hibás azonosító (oEmbed 404): 400-as validációs hiba.
    const bad = await handleAdminLiveRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/live', {
        youtubeUrl: 'https://www.youtube.com/watch?v=nemletezo',
        startsAt: '2026-09-01T10:00:00+02:00',
        endsAt: '2026-09-01T12:00:00+02:00',
      }),
      undefined,
      undefined,
      baseDeps,
    )
    const badBody = await responseBody(bad)
    expect(badBody.status).toBe(400)
    expect(badBody.payload['error']).toBe('validation')

    // Érvényes oEmbed válasszal menthető.
    const okDeps = { ...deps(ctx), fetchImpl: oembedFetch(true) }
    const created = await handleAdminLiveRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/live', {
        youtubeUrl: 'https://www.youtube.com/watch?v=abc12345',
        startsAt: '2026-09-01T10:00:00+02:00',
        endsAt: '2026-09-01T12:00:00+02:00',
      }),
      undefined,
      undefined,
      okDeps,
    )
    const createdBody = await responseBody(created)
    expect(createdBody.status).toBe(200)
    const liveId = String(createdBody.payload['id'])

    // Átfedő ablak nem menthető.
    const overlap = await handleAdminLiveRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/live', {
        youtubeUrl: 'https://youtu.be/xyz98765',
        startsAt: '2026-09-01T11:00:00+02:00',
        endsAt: '2026-09-01T13:00:00+02:00',
      }),
      undefined,
      undefined,
      okDeps,
    )
    expect(overlap.status).toBe(409)

    // Indítás most → aktív.
    const started = await handleAdminLiveRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/live/${liveId}/start_now`,
        {},
      ),
      liveId,
      'start_now',
      okDeps,
    )
    const startBody = await responseBody(started)
    expect(startBody.status).toBe(200)
    expect(startBody.payload['activated']).toBe(true)

    // Lezárás most → ended.
    const ended = await handleAdminLiveRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/live/${liveId}/end_now`, {}),
      liveId,
      'end_now',
      okDeps,
    )
    expect(ended.status).toBe(200)
    const rows = await ctx.db
      .select()
      .from(liveStreams)
      .where(eq(liveStreams.id, liveId))
    expect(rows.at(0)?.status).toBe('ended')
  })
})

describe.skipIf(!hasTestDatabase)('BSS-031: Rólunk-videók', () => {
  it('csak publikált publikus videók, max hat, sorrenddel', async () => {
    const ctx = await setupAdminApiTest('bss hpabout')
    const inserted = await ctx.db
      .insert(videos)
      .values([
        {
          slug: 'about-pub-1',
          title: 'Publikus egyes',
          status: 'published',
          visibility: 'public',
          publishedAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          slug: 'about-pub-2',
          title: 'Publikus kettes',
          status: 'published',
          visibility: 'public',
          publishedAt: new Date('2026-01-02T10:00:00Z'),
        },
        { slug: 'about-draft', title: 'Nem publikus' },
      ])
      .returning()

    // Érvénytelen elemet tartalmazó lista elutasítva.
    const invalid = await handleAdminAboutRoute(
      jsonRequest(ctx.leadershipToken, '/api/admin/about', {
        orderedVideoIds: [inserted[0].id, inserted[2].id],
      }),
      deps(ctx),
    )
    expect(invalid.status).toBe(400)

    // Érvényes lista sorrenddel.
    const ok = await handleAdminAboutRoute(
      jsonRequest(ctx.leadershipToken, '/api/admin/about', {
        orderedVideoIds: [inserted[1].id, inserted[0].id],
      }),
      deps(ctx),
    )
    expect(ok.status).toBe(200)

    const data = await getHomepageAdminData(ctx.db)
    expect(data.about.map((entry) => entry.videoId)).toEqual([
      inserted[1].id,
      inserted[0].id,
    ])
    expect(data.about.every((entry) => entry.valid)).toBe(true)
    expect(data.highlight.videoId).toBeNull()
  })

  it('az admin adatmodul visszaadja a kiemelést, live-okat és választható videókat', async () => {
    const ctx = await setupAdminApiTest('bss hpdata')
    const data = await getHomepageAdminData(ctx.db)
    expect(data.live).toEqual([])
    expect(data.about).toEqual([])
    expect(data.highlight.videoId).toBeNull()
    expect(Array.isArray(data.selectableVideos)).toBe(true)
  })
})
