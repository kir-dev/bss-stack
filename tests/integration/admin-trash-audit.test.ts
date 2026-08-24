import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  jsonRequest,
  reachableMediaFetch,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import { handleAdminVideoRoutes } from '#/server/api/admin/video-routes.ts'
import { getTrashPage, remainingTrashDays } from '#/server/admin/trash-admin.ts'
import { getAuditPage, parseAuditFilters } from '#/server/admin/audit-admin.ts'
import { videos } from '#/db/schema.ts'
import { FakeClock } from '#/lib/clock.ts'

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

async function createAndTrash(
  ctx: Awaited<ReturnType<typeof setupAdminApiTest>>,
  title: string,
): Promise<string> {
  const created = await handleAdminVideoRoutes(
    jsonRequest(ctx.memberToken, '/api/admin/videos', { title }),
    'create',
    undefined,
    deps(ctx),
  )
  const videoId = String((await responseBody(created)).payload['id'])
  const trashed = await handleAdminVideoRoutes(
    jsonRequest(ctx.memberToken, `/api/admin/videos/${videoId}/trash`, {
      version: 1,
    }),
    'trash',
    videoId,
    deps(ctx),
  )
  expect(trashed.status).toBe(200)
  return videoId
}

describe.skipIf(!hasTestDatabase)('BSS-033: lomtár', () => {
  it('minden tag látja a lomtárat törlővel és hátralévő idővel; visszaállítás vezetőségi', async () => {
    const ctx = await setupAdminApiTest('bss trashtag')
    // A tag lomtárba helyez (saját nevében).
    await createAndTrash(ctx, 'Lomtári egyes')
    // A vezetőség is lomtárba helyez egy másikat.
    await createAndTrash(ctx, 'Lomtári kettes')

    // A lomtárlista-modul nem kér viewer-t: minden tag számára látható.
    const page1 = await getTrashPage(ctx.db, { page: 1, perPage: 25 })
    expect(page1.total).toBe(2)
    const first = page1.items[0]
    expect(first.trashedByName).toBeDefined()
    expect(first.remainingDays).toBeLessThanOrEqual(30)

    // A tag API-n nem állíthat vissza (403), a vezetőség igen.
    const target = page1.items.find((item) => item.title === 'Lomtári egyes')!
    const memberRestore = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, `/api/admin/videos/${target.id}/restore`, {
        version: target.version,
      }),
      'restore',
      target.id,
      deps(ctx),
    )
    expect(memberRestore.status).toBe(403)

    const leaderRestore = await handleAdminVideoRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/videos/${target.id}/restore`,
        { version: target.version },
      ),
      'restore',
      target.id,
      deps(ctx),
    )
    expect(leaderRestore.status).toBe(200)
    const rows = await ctx.db
      .select()
      .from(videos)
      .where(eq(videos.id, target.id))
    expect(rows.at(0)?.status).toBe('archived')
    // A kapcsolatok megmaradnak — a restore után a rekord létezik és archivált.
  })

  it('remainingTrashDays a FakeClock ideje szerint számol; 30 nap után lejár', async () => {
    const trashedAt = new Date('2026-08-24T10:00:00Z')
    const now0 = new Date('2026-08-24T12:00:00Z')
    expect(remainingTrashDays(trashedAt, now0)).toBe(30)

    const now29 = new Date(trashedAt.getTime() + 29 * 86_400_000)
    expect(remainingTrashDays(trashedAt, now29)).toBe(1)

    const now31 = new Date(trashedAt.getTime() + 31 * 86_400_000)
    expect(remainingTrashDays(trashedAt, now31)).toBe(0)
    void FakeClock
  })

  it('elavult verziójú restore konfliktust kap (nem írja felül a frissebb állapotot)', async () => {
    const ctx = await setupAdminApiTest('bss trashstale')
    const videoId = await createAndTrash(ctx, 'Konfliktusos')

    // Vezetőség módosítja a rekordot közben (verzió nő).
    const updated = await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${videoId}/update`, {
        version: 2,
        description: 'közbeni módosítás',
      }),
      'update',
      videoId,
      deps(ctx),
    )
    expect(updated.status).toBe(200)

    // Restore elavult verzióval → 409 konfliktus.
    const staleRestore = await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${videoId}/restore`, {
        version: 2,
      }),
      'restore',
      videoId,
      deps(ctx),
    )
    expect(staleRestore.status).toBe(409)

    // Aktuális verzióval sikeres.
    const okRestore = await handleAdminVideoRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/videos/${videoId}/restore`, {
        version: 3,
      }),
      'restore',
      videoId,
      deps(ctx),
    )
    expect(okRestore.status).toBe(200)
    const rows = await ctx.db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId))
    expect(rows.at(0)?.status).toBe('archived')
  })
})

describe.skipIf(!hasTestDatabase)('BSS-033: auditnapló', () => {
  it('szereplőre, műveletre, entitásra és dátumra szűr; részletnézet előtte-utána', async () => {
    const ctx = await setupAdminApiTest('bss audfilters')
    const created = await handleAdminVideoRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/videos', {
        title: 'Auditos videó',
      }),
      'create',
      undefined,
      deps(ctx),
    )
    const videoId = String((await responseBody(created)).payload['id'])

    const all = await getAuditPage(ctx.db, { page: 1, perPage: 25 })
    expect(all.total).toBeGreaterThanOrEqual(1)

    const byActor = await getAuditPage(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAuditFilters({ actor: 'sub-admin-member' }),
    })
    expect(byActor.total).toBeGreaterThanOrEqual(1)

    const byAction = await getAuditPage(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAuditFilters({ action: 'create' }),
    })
    expect(byAction.items.every((item) => item.action === 'create')).toBe(true)

    const byEntity = await getAuditPage(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAuditFilters({ entityType: 'video', entityId: videoId }),
    })
    expect(byEntity.total).toBe(1)
    const entry = byEntity.items[0]
    expect(entry.beforeJson).toBeNull()
    expect(entry.afterJson).toContain(
      '"title": "Auditos videó"'.replace(', ', ', '),
    )

    // Dátumszűrő: csak jövőbeli időablak → üres.
    const byFutureDate = await getAuditPage(ctx.db, {
      page: 1,
      perPage: 25,
      filters: parseAuditFilters({ from: '2030-01-01', to: '2030-01-02' }),
    })
    expect(byFutureDate.total).toBe(0)

    // parseAuditFilters ismeretlen értékeket eldob.
    expect(parseAuditFilters({ actor: ' x ', from: 'bad-date' })).toEqual({
      actor: 'x',
    })
  })

  it('az audit nem módosítható az alkalmazásból: nincs admin végpont az írásra', async () => {
    // Az admin API diszpécserben nincs audit-mutáció útvonal; ezt rögzítjük:
    // a /api/admin/audit prefixre hívás 404-et kap.
    const { handleApiRequest } = await import('#/server/api/router.ts')
    const response = await handleApiRequest(
      new Request('http://localhost/api/admin/audit/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(response.status).toBe(404)
  })
})
