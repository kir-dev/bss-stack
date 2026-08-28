import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  jsonRequest,
  reachableMediaFetch,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import { handleAdminEventRoutes } from '#/server/api/admin/event-routes.ts'
import {
  getAdminEventDetail,
  getAdminEventList,
  parseAdminEventFilters,
} from '#/server/admin/event-list.ts'
import { events, videos } from '#/db/schema.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

function deps(ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) {
  return { db: ctx.db, config: testConfig, fetchImpl: reachableMediaFetch() }
}

describe.skipIf(!hasTestDatabase)('BSS-029: esemény API jogosultságok', () => {
  it('névtelen kérés 401-et kap belépési URL-lel', async () => {
    const ctx = await setupAdminApiTest('bss evanon')
    const response = await handleAdminEventRoutes(
      jsonRequest(null, '/api/admin/events', { title: 'X' }),
      'create',
      undefined,
      deps(ctx),
    )
    const { status, payload } = await responseBody(response)
    expect(status).toBe(401)
    expect(payload['error']).toBe('auth_required')
  })

  it('schönherz 403-at kap; tag publikálhat és archiválhat', async () => {
    const ctx = await setupAdminApiTest('bss evroles')

    const schonherzCreate = await handleAdminEventRoutes(
      jsonRequest(ctx.schonherzToken, '/api/admin/events', { title: 'S' }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(schonherzCreate.status).toBe(403)

    const created = await handleAdminEventRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/events', {
        title: 'Tag eseménye',
        startDate: '2026-06-01',
      }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(created.status).toBe(200)
    const eventId = String((await responseBody(created)).payload['id'])

    const published = await handleAdminEventRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/events/${eventId}/publish`, {
        version: 1,
      }),
      'publish',
      eventId,
      deps(ctx),
    )
    expect(published.status).toBe(200)

    const archived = await handleAdminEventRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/events/${eventId}/archive`, {
        version: 2,
      }),
      'archive',
      eventId,
      deps(ctx),
    )
    expect(archived.status).toBe(200)
  })

  it('tag nem törölhet véglegesen — API-n is tilos; vezetőség címbeírással igen', async () => {
    const ctx = await setupAdminApiTest('bss evdelete')
    const eventRows = await ctx.db
      .insert(events)
      .values({
        slug: 'torlendo-esemeny',
        title: 'Törlendő esemény',
        startDate: '2026-05-01',
        status: 'published',
      })
      .returning()
    const eventId = eventRows.at(0)!.id
    await ctx.db.insert(videos).values([
      {
        slug: 'kapcsolt-videó-a',
        title: 'A',
        eventId,
        recordedAt: '2026-05-01',
      },
      { slug: 'kapcsolt-videó-b', title: 'B', eventId },
    ])

    // Tag: nincs is joga.
    const memberDelete = await handleAdminEventRoutes(
      jsonRequest(
        ctx.memberToken,
        `/api/admin/events/${eventId}/delete_permanent`,
        {
          confirmationTitle: 'Törlendő esemény',
        },
      ),
      'delete_permanent',
      eventId,
      deps(ctx),
    )
    expect(memberDelete.status).toBe(403)
    const stillThere = await ctx.db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
    expect(stillThere).toHaveLength(1)

    // Vezetőség rossz megerősítéssel: hiba, semmi nem törlődik.
    const badConfirm = await handleAdminEventRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/events/${eventId}/delete_permanent`,
        { confirmationTitle: 'Rossz cím' },
      ),
      'delete_permanent',
      eventId,
      deps(ctx),
    )
    expect(badConfirm.status).toBe(400)
    expect((await responseBody(badConfirm)).payload['error']).toBe(
      'confirmation',
    )
    expect(
      await ctx.db.select().from(events).where(eq(events.id, eventId)),
    ).toHaveLength(1)

    // Helyes címbeírással: tranzakcionális törlés, videók leválasztva.
    const ok = await handleAdminEventRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/events/${eventId}/delete_permanent`,
        { confirmationTitle: 'Törlendő esemény' },
      ),
      'delete_permanent',
      eventId,
      deps(ctx),
    )
    const okBody = await responseBody(ok)
    expect(okBody.status).toBe(200)
    expect(okBody.payload['detachedVideoCount']).toBe(2)

    expect(
      await ctx.db.select().from(events).where(eq(events.id, eventId)),
    ).toHaveLength(0)
    const detachedVideos = await ctx.db.select().from(videos)
    expect(detachedVideos).toHaveLength(2)
    for (const video of detachedVideos) {
      expect(video.eventId).toBeNull()
    }

    const withDate = detachedVideos.find(
      (video) => video.slug === 'kapcsolt-videó-a',
    )
    expect(withDate?.recordedAt).toBe('2026-05-01')
  })

  it('elavult mentés blokkolva (StaleWriteError → 409)', async () => {
    const ctx = await setupAdminApiTest('bss evstale')
    const created = await handleAdminEventRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/events', { title: 'Eredeti' }),
      'create',
      undefined,
      deps(ctx),
    )
    const eventId = String((await responseBody(created)).payload['id'])

    await handleAdminEventRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/events/${eventId}/update`, {
        version: 1,
        description: 'Első',
      }),
      'update',
      eventId,
      deps(ctx),
    )
    const stale = await handleAdminEventRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/events/${eventId}/update`, {
        version: 1,
        description: 'Elavult',
      }),
      'update',
      eventId,
      deps(ctx),
    )
    expect(stale.status).toBe(409)
  })
})

describe.skipIf(!hasTestDatabase)(
  'BSS-029: eseménylista és részletmodul',
  () => {
    it('lista szűrők és videószám működnek', async () => {
      const ctx = await setupAdminApiTest('bss evlist')
      const inserted = await ctx.db
        .insert(events)
        .values([
          {
            slug: 'ev-lista-a',
            title: 'Tavaszi gála',
            startDate: '2026-03-01',
            status: 'published',
          },
          {
            slug: 'ev-lista-b',
            title: 'Nyári tábor',
            startDate: '2026-07-10',
            endDate: '2026-07-15',
            status: 'draft',
          },
          {
            slug: 'ev-lista-c',
            title: 'Őszi bemutató',
            startDate: null,
            status: 'draft',
          },
        ])
        .returning()
      await ctx.db.insert(videos).values({
        slug: 'ev-lista-video',
        title: 'Videó az első eseményhez',
        eventId: inserted[0].id,
      })

      const all = await getAdminEventList(ctx.db, { page: 1, perPage: 25 })
      expect(all.total).toBe(3)

      const drafts = await getAdminEventList(ctx.db, {
        page: 1,
        perPage: 25,
        filters: parseAdminEventFilters({ status: 'draft' }),
      })
      expect(drafts.items.map((item) => item.slug).sort()).toEqual([
        'ev-lista-b',
        'ev-lista-c',
      ])

      const bySearch = await getAdminEventList(ctx.db, {
        page: 1,
        perPage: 25,
        filters: parseAdminEventFilters({ q: 'gála' }),
      })
      expect(bySearch.items.map((item) => item.slug)).toEqual(['ev-lista-a'])
      expect(bySearch.items[0]?.videoCount).toBe(1)

      const byDateFrom = await getAdminEventList(ctx.db, {
        page: 1,
        perPage: 25,
        filters: parseAdminEventFilters({ from: '2026-07-01' }),
      })
      expect(byDateFrom.items.map((item) => item.slug)).toEqual(['ev-lista-b'])

      // parseAdminEventFilters: ismeretlen értékek eldobása
      expect(
        parseAdminEventFilters({ q: ' x ', status: 'nope', from: 'bad-date' }),
      ).toEqual({ q: 'x' })
    })

    it('részletmodol a leválasztandó videókat is visszaadja', async () => {
      const ctx = await setupAdminApiTest('bss evdetail')
      const inserted = await ctx.db
        .insert(events)
        .values({
          slug: 'ev-detail',
          title: 'Részletes esemény',
          startDate: '2026-04-01',
        })
        .returning()
      await ctx.db.insert(videos).values({
        slug: 'ev-detail-video',
        title: 'Kapcsolt',
        eventId: inserted[0].id,
      })

      const detail = await getAdminEventDetail(ctx.db, inserted[0].id)
      expect(detail?.attachedVideoIds).toHaveLength(1)
      expect(detail?.startDate).toBe('2026-04-01')
      expect(
        await getAdminEventDetail(
          ctx.db,
          '00000000-0000-4000-8000-000000000000',
        ),
      ).toBeNull()
    })
  },
)
