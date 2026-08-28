import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  reachableMediaFetch,
  redirectingMediaFetch,
  responseBody,
  setupAdminApiTest,
  jsonRequest,
  testConfig,
} from '../helpers/admin-api.ts'
import { handleAdminVideoRoutes } from '#/server/api/admin/video-routes.ts'
import { getAdminVideoDetail } from '#/server/admin/video-detail.ts'
import {
  getAdminVideoList,
  parseAdminVideoFilters,
} from '#/server/admin/video-list.ts'
import { auditLog, events, tags, videos } from '#/db/schema.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

function depsFor(ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) {
  return { db: ctx.db, config: testConfig, fetchImpl: reachableMediaFetch() }
}

describe.skipIf(!hasTestDatabase)(
  'BSS-028: admin videó API jogosultságok',
  () => {
    it('névtelen kérés 401-et kap belépési URL-lel', async () => {
      const ctx = await setupAdminApiTest('bss_vidanon')
      const response = await handleAdminVideoRoutes(
        jsonRequest(null, '/api/admin/videos', { title: 'X' }),
        'create',
        undefined,
        depsFor(ctx),
      )
      const { status, payload } = await responseBody(response)
      expect(status).toBe(401)
      expect(payload['error']).toBe('auth_required')
      expect(String(payload['loginUrl'])).toContain(
        encodeURIComponent('/api/admin/videos'),
      )
    })

    it('schönherz felhasználó 403-at kap minden admin videóműveletre', async () => {
      const ctx = await setupAdminApiTest('bss vidsch'.replace(' ', ''))
      const created = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, '/api/admin/videos', { title: 'V' }),
        'create',
        undefined,
        depsFor(ctx),
      )
      const { payload } = await responseBody(created)
      const videoId = String(payload['id'])

      for (const action of ['update', 'publish', 'archive', 'trash']) {
        const response = await handleAdminVideoRoutes(
          jsonRequest(
            ctx.schonherzToken,
            `/api/admin/videos/${videoId}/${action}`,
            {
              version: 1,
            },
          ),
          action,
          videoId,
          depsFor(ctx),
        )
        expect(response.status).toBe(403)
      }
    })

    it('tag a lomtárból való visszaállítást nem hívhatja (vezetőségi jog)', async () => {
      const ctx = await setupAdminApiTest('bss vidrestore')
      const created = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, '/api/admin/videos', { title: 'Vissza' }),
        'create',
        undefined,
        depsFor(ctx),
      )
      const videoId = String((await responseBody(created)).payload['id'])

      // A tag lomtárba tehet...
      const trashed = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/trash`, {
          version: 1,
        }),
        'trash',
        videoId,
        depsFor(ctx),
      )
      expect(trashed.status).toBe(200)

      // ...de visszaállítani nem.
      const restore = await handleAdminVideoRoutes(
        jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/restore`, {
          version: 2,
        }),
        'restore',
        videoId,
        depsFor(ctx),
      )
      const { status, payload } = await responseBody(restore)
      expect(status).toBe(403)
      expect(payload['error']).toBe('forbidden')

      // Vezetőség vissza tudja állítani archivált állapotba.
      const leaderRestore = await handleAdminVideoRoutes(
        jsonRequest(
          ctx.leadershipToken,
          `/api/admin/videos/${videoId}/restore`,
          {
            version: 2,
          },
        ),
        'restore',
        videoId,
        depsFor(ctx),
      )
      expect(leaderRestore.status).toBe(200)
      const row = await ctx.db
        .select()
        .from(videos)
        .where(eq(videos.id, videoId))
      expect(row.at(0)?.status).toBe('archived')
    })
  },
)

describe.skipIf(!hasTestDatabase)('BSS-028: piszkozat és publikálás', () => {
  it('piszkozat csak címmel és részleges médiabeállítással is menthető', async () => {
    const ctx = await setupAdminApiTest('bss viddraft')
    const response = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', {
        title: 'Hibás médiás piszkozat',
      }),
      'create',
      undefined,
      depsFor(ctx),
    )
    expect(response.status).toBe(200)
    const videoId = String((await responseBody(response)).payload['id'])

    const saved = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/update`, {
        version: 1,
        encodingGroup: '4a3_SD',
        baseFilename: 'draft-video',
      }),
      'update',
      videoId,
      depsFor(ctx),
    )
    expect(saved.status).toBe(200)
    const detail = await getAdminVideoDetail(ctx.db, videoId)
    expect(detail?.encodingGroup).toBe('4a3_SD')
    expect(detail?.baseFilename).toBe('draft-video')
    expect(detail?.status).toBe('draft')
  })

  it('publikálás kötelező mezőket és médiát ellenőriz; sikeres esetben publikált lesz', async () => {
    const ctx = await setupAdminApiTest('bss vidpublish')

    async function createVideo(): Promise<string> {
      const created = await handleAdminVideoRoutes(
        jsonRequest(ctx.leadershipToken, '/api/admin/videos', {
          title: 'Publikálható videó',
        }),
        'create',
        undefined,
        depsFor(ctx),
      )
      return String((await responseBody(created)).payload['id'])
    }

    // 1. hiányzó média → 400
    const missing = await createVideo()
    const missingResponse = await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${missing}/publish`, {
        version: 1,
      }),
      'publish',
      missing,
      depsFor(ctx),
    )
    const missingBody = await responseBody(missingResponse)
    expect(missingBody.status).toBe(400)
    expect(String(JSON.stringify(missingBody.payload))).toContain('Videóprofil')

    // 2. átirányító média → 400 (mockolt fetch)
    const redirected = await createVideo()
    await handleAdminVideoRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/videos/${redirected}/update`,
        {
          version: 1,
          encodingGroup: '16a9_HD',
          hasHq: true,
          hasLq: true,
          baseFilename: 'redirected-video',
        },
      ),
      'update',
      redirected,
      depsFor(ctx),
    )
    const badMedia = await handleAdminVideoRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/videos/${redirected}/publish`,
        {
          version: 2,
        },
      ),
      'publish',
      redirected,
      { db: ctx.db, config: testConfig, fetchImpl: redirectingMediaFetch() },
    )
    expect(badMedia.status).toBe(400)

    // 3. elérhető média → 200 published
    const ok = await createVideo()
    await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${ok}/update`, {
        version: 1,
        encodingGroup: '16a9_HD',
        hasHq: true,
        hasLq: true,
        baseFilename: 'ok-video',
      }),
      'update',
      ok,
      depsFor(ctx),
    )
    const published = await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${ok}/publish`, {
        version: 2,
      }),
      'publish',
      ok,
      depsFor(ctx),
    )
    const publishBody = await responseBody(published)
    expect(publishBody.status).toBe(200)
    const row = await ctx.db.select().from(videos).where(eq(videos.id, ok))
    expect(row.at(0)?.status).toBe('published')
    expect(row.at(0)?.publishedAt).not.toBeNull()
  })

  it('elavult mentés 409-es konfliktust kap, nem írja felül a frissebb adatot', async () => {
    const ctx = await setupAdminApiTest('bss vidstale')
    const created = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', { title: 'Első cím' }),
      'create',
      undefined,
      depsFor(ctx),
    )
    const videoId = String((await responseBody(created)).payload['id'])

    const first = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/update`, {
        version: 1,
        description: 'Első módosítás',
      }),
      'update',
      videoId,
      depsFor(ctx),
    )
    expect(first.status).toBe(200)

    // Egy másik szerkesztő közben újraírta a rekordot:
    const second = await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${videoId}/update`, {
        version: 2,
        description: 'Második módosítás',
      }),
      'update',
      videoId,
      depsFor(ctx),
    )
    expect(second.status).toBe(200)

    // Az első kliens elavult verzióval próbál menteni → blokkolva.
    const stale = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/update`, {
        version: 1,
        title: 'Utolsó mentés nem nyer',
      }),
      'update',
      videoId,
      depsFor(ctx),
    )
    const { status, payload } = await responseBody(stale)
    expect(status).toBe(409)
    expect(payload['error']).toBe('conflict')

    const row = await ctx.db.select().from(videos).where(eq(videos.id, videoId))
    expect(row.at(0)?.description).toBe('Második módosítás')
  })
})

describe.skipIf(!hasTestDatabase)('BSS-028: kapcsolatok kezelése', () => {
  it('címkék: ismeretlen címke tiltott, meglévő rendelhető', async () => {
    const ctx = await setupAdminApiTest('bss vidtags')
    const created = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', { title: 'Címkézett' }),
      'create',
      undefined,
      depsFor(ctx),
    )
    const videoId = String((await responseBody(created)).payload['id'])

    const unknown = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/tags`, {
        version: 1,
        tagIds: ['00000000-0000-4000-8000-000000000001'],
      }),
      'tags',
      videoId,
      depsFor(ctx),
    )
    expect(unknown.status).toBe(400)

    const inserted = await ctx.db
      .insert(tags)
      .values({ name: 'Teszt címke', normalizedName: 'teszt címke' })
      .returning()
    const tagId = inserted.at(0)!.id

    const ok = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/tags`, {
        version: 1,
        tagIds: [tagId],
      }),
      'tags',
      videoId,
      depsFor(ctx),
    )
    expect(ok.status).toBe(200)
    const detail = await getAdminVideoDetail(ctx.db, videoId)
    expect(detail?.tagIds).toEqual([tagId])
  })

  it('kapcsolódó videók: önhivatkozás és nem publikált tiltva, publikált rendelve', async () => {
    const ctx = await setupAdminApiTest('bss vidrel')
    const created = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', { title: 'Fő videó' }),
      'create',
      undefined,
      depsFor(ctx),
    )
    const videoId = String((await responseBody(created)).payload['id'])

    const self = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/related`, {
        version: 1,
        relatedVideoIds: [videoId],
      }),
      'related',
      videoId,
      depsFor(ctx),
    )
    expect(self.status).toBe(400)

    const draftPeer = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', {
        title: 'Piszkozat társ',
      }),
      'create',
      undefined,
      depsFor(ctx),
    )
    const draftId = String((await responseBody(draftPeer)).payload['id'])
    const notPublished = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/related`, {
        version: 1,
        relatedVideoIds: [draftId],
      }),
      'related',
      videoId,
      depsFor(ctx),
    )
    expect(notPublished.status).toBe(400)

    // Publikált társ már rendelve.
    await ctx.db.insert(videos).values({
      slug: 'publikus-tars',
      title: 'Publikus társ',
      status: 'published',
      visibility: 'public',
      publishedAt: new Date('2026-01-01T10:00:00Z'),
    })
    const peerRows = await ctx.db
      .select()
      .from(videos)
      .where(eq(videos.slug, 'publikus-tars'))
    const peerId = peerRows.at(0)!.id

    const ok = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/related`, {
        version: 1,
        relatedVideoIds: [peerId],
      }),
      'related',
      videoId,
      depsFor(ctx),
    )
    expect(ok.status).toBe(200)
    const detail = await getAdminVideoDetail(ctx.db, videoId)
    expect(detail?.relatedVideoIds).toEqual([peerId])
  })

  it('esemény-hozzárendelés egynapos eseménynél kitölti az üres dátumot', async () => {
    const ctx = await setupAdminApiTest('bss videvent')
    const eventRows = await ctx.db
      .insert(events)
      .values({
        slug: 'egynapos-esemeny',
        title: 'Egynapos esemény',
        startDate: '2026-05-01',
        status: 'published',
      })
      .returning()
    const eventId = eventRows.at(0)!.id

    const created = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', {
        title: 'Dátumtalan',
      }),
      'create',
      undefined,
      depsFor(ctx),
    )
    const videoId = String((await responseBody(created)).payload['id'])

    const updated = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/update`, {
        version: 1,
        eventId,
      }),
      'update',
      videoId,
      depsFor(ctx),
    )
    expect(updated.status).toBe(200)
    const row = await ctx.db.select().from(videos).where(eq(videos.id, videoId))
    expect(row.at(0)?.recordedAt).toBe('2026-05-01')
  })
})

describe.skipIf(!hasTestDatabase)('BSS-028: admin lista szűrők', () => {
  it('parseAdminVideoFilters ismeretlen értékeket eldob', () => {
    expect(
      parseAdminVideoFilters({
        q: ' bstv ',
        status: 'hacker',
        visibility: 'public',
        event: 'nem-uuid',
        tag: '00000000-0000-4000-8000-000000000009',
      }),
    ).toEqual({
      q: 'bstv',
      visibility: 'public',
      tagId: '00000000-0000-4000-8000-000000000009',
    })
  })

  it('a lista státusz, láthatóság, keresés és címké szerint szűr', async () => {
    const ctx = await setupAdminApiTest('bss vidlist')
    const seededTag = (
      await ctx.db
        .insert(tags)
        .values({ name: 'Lista címke', normalizedName: 'lista címke' })
        .returning()
    ).at(0)!
    const seedRows = await ctx.db
      .insert(videos)
      .values([
        {
          slug: 'lista-publikus',
          title: 'Publikusz keresés',
          status: 'published',
          visibility: 'public',
          publishedAt: new Date('2026-02-01T10:00:00Z'),
        },
        {
          slug: 'lista-draft',
          title: 'Piszkozati videó',
          status: 'draft',
          visibility: 'bss',
        },
        {
          slug: 'lista-trash',
          title: 'Lomtári videó',
          status: 'trash',
          visibility: 'schonherz',
          trashedAt: new Date(),
        },
      ])
      .returning()

    const all = await getAdminVideoList(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAdminVideoFilters({}),
    })
    expect(all.total).toBe(3)

    const drafts = await getAdminVideoList(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAdminVideoFilters({ status: 'draft' }),
    })
    expect(drafts.items.map((item) => item.slug)).toEqual(['lista-draft'])

    const schonherzOnly = await getAdminVideoList(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAdminVideoFilters({ visibility: 'schonherz' }),
    })
    expect(schonherzOnly.items.map((item) => item.slug)).toEqual([
      'lista-trash',
    ])

    const bySearch = await getAdminVideoList(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAdminVideoFilters({ q: 'keresés' }),
    })
    expect(bySearch.items.map((item) => item.slug)).toEqual(['lista-publikus'])

    await ctx.db.execute(
      `insert into video_tags (video_id, tag_id) values ('${seedRows[0].id}', '${seededTag.id}')`,
    )
    const byTag = await getAdminVideoList(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAdminVideoFilters({ tag: seededTag.id }),
    })
    expect(byTag.items.map((item) => item.slug)).toEqual(['lista-publikus'])
  })

  it('a részletmodul az összes mezőt és kapcsolatot betölti; ismeretlen id-re null', async () => {
    const ctx = await setupAdminApiTest('bss viddetail')
    const rows = await ctx.db
      .insert(videos)
      .values({
        slug: 'detail-video',
        title: 'Részletes videó',
        description: 'Leírás',
        status: 'published',
        visibility: 'bss',
        viewCount: 7,
        publishedAt: new Date('2026-03-01T10:00:00Z'),
      })
      .returning()
    const videoId = rows.at(0)!.id

    const detail = await getAdminVideoDetail(ctx.db, videoId)
    expect(detail).toMatchObject({
      slug: 'detail-video',
      title: 'Részletes videó',
      viewCount: 7,
      status: 'published',
      visibility: 'bss',
    })
    expect(
      await getAdminVideoDetail(ctx.db, '00000000-0000-4000-8000-000000000000'),
    ).toBeNull()
  })

  it('minden domain-művelet auditbejegyzést ír', async () => {
    const ctx = await setupAdminApiTest('bss vidaudit')
    const created = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', { title: 'Auditált' }),
      'create',
      undefined,
      depsFor(ctx),
    )
    const videoId = String((await responseBody(created)).payload['id'])
    const audits = await ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, videoId))
    expect(audits.length).toBe(1)
    expect(audits.at(0)?.action).toBe('create')
  })
})
