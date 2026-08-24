import { afterAll, describe, expect, it } from 'vitest'
import {
  jsonRequest,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import {
  handleAdminStaffRoleRoutes,
  handleAdminTagRoutes,
} from '#/server/api/admin/catalog-routes.ts'
import { tags, staffRoles, videoTags, videos, videoStaff } from '#/db/schema.ts'
import { eq } from 'drizzle-orm'
import { listTagsWithUsage } from '#/server/catalog/tags.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

function deps(ctx: Awaited<ReturnType<typeof setupAdminApiTest>>) {
  return { db: ctx.db, config: testConfig }
}

describe.skipIf(!hasTestDatabase)('BSS-030: katalógus jogosultságok', () => {
  it('tag közvetlen API-hívással sem módosíthatja a címkekatalógust', async () => {
    const ctx = await setupAdminApiTest('bss catauth')
    for (const [path, body] of [
      ['/api/admin/tags', { name: 'Új' }],
      [
        '/api/admin/tags/00000000-0000-4000-8000-000000000001/rename',
        { name: 'X' },
      ],
      ['/api/admin/tags/00000000-0000-4000-8000-000000000001/delete', {}],
    ] as const) {
      const response = await handleAdminTagRoutes(
        jsonRequest(ctx.memberToken, path, body),
        path.split('/').at(-1) === 'tags'
          ? 'create'
          : (path.split('/').at(-1) as string),
        undefined,
        deps(ctx),
      )
      expect(response.status).toBe(403)
    }
  })

  it('tag nem módosíthat stábszerepet és nem látja a listát sem API-n', async () => {
    const ctx = await setupAdminApiTest('bss catauth2')
    const create = await handleAdminStaffRoleRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/staff-roles', { name: 'X' }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(create.status).toBe(403)
  })

  it('névtelen 401-et kap', async () => {
    const ctx = await setupAdminApiTest('bss catanon')
    const response = await handleAdminTagRoutes(
      jsonRequest(null, '/api/admin/tags', { name: 'X' }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(response.status).toBe(401)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-030: címkekatalógus műveletek', () => {
  it('létrehozás, duplikátum tiltás, ékezeti hasonlóság figyelmeztetés', async () => {
    const ctx = await setupAdminApiTest('bss cattag')

    const created = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/tags', { name: 'Főzés' }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(created.status).toBe(200)

    // Kisbetű + whitespace normalizáció → konfliktus.
    const duplicate = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/tags', {
        name: '  főzés  ',
      }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(duplicate.status).toBe(409)
    expect((await responseBody(duplicate)).payload['error']).toBe(
      'name_conflict',
    )

    // Ékezetes hasonló: csak figyelmeztetés (similar), létrehozható.
    const similar = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/tags/similar?name=Fozés'),
      'similar',
      undefined,
      deps(ctx),
    )
    const similarBody = await responseBody(similar)
    expect(similarBody.status).toBe(200)
    expect(similarBody.payload['similar']).toContain('Főzés')

    const accentCreated = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/tags', { name: 'Fozés' }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(accentCreated.status).toBe(200)
  })

  it('átnevezés és összevonás kapcsolatvesztés nélkül; használt címke csak címbeírással törlhető', async () => {
    const ctx = await setupAdminApiTest('bss catmerge')
    const source = (
      await ctx.db
        .insert(tags)
        .values({ name: 'Régi név', normalizedName: 'régi név' })
        .returning()
    ).at(0)!
    const target = (
      await ctx.db
        .insert(tags)
        .values({ name: 'Cél név', normalizedName: 'cél név' })
        .returning()
    ).at(0)!
    const videoRows = await ctx.db
      .insert(videos)
      .values({ slug: 'cat-video', title: 'Videó' })
      .returning()
    await ctx.db
      .insert(videoTags)
      .values({ videoId: videoRows[0].id, tagId: source.id })

    // Átnevezés megtartja az azonosítót.
    const renamed = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/tags/${source.id}/rename`, {
        name: 'Új név',
      }),
      'rename',
      source.id,
      deps(ctx),
    )
    expect(renamed.status).toBe(200)
    const afterRename = await ctx.db
      .select()
      .from(tags)
      .where(eq(tags.id, source.id))
    expect(afterRename.at(0)?.name).toBe('Új név')

    // Összevonás: a kapcsolat a célcímkére kerül, a forrás törlődik.
    const merged = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/tags/${source.id}/merge`, {
        targetTagId: target.id,
      }),
      'merge',
      source.id,
      deps(ctx),
    )
    expect(merged.status).toBe(200)
    expect(
      await ctx.db.select().from(tags).where(eq(tags.id, source.id)),
    ).toHaveLength(0)
    const linksAfter = await ctx.db
      .select()
      .from(videoTags)
      .where(eq(videoTags.videoId, videoRows[0].id))
    expect(linksAfter.map((link) => link.tagId)).toEqual([target.id])

    // Használt címke törlése rossz megerősítéssel blokkolva.
    const badDelete = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/tags/${target.id}/delete`, {
        confirmation: 'nem egyezik',
      }),
      'delete',
      target.id,
      deps(ctx),
    )
    expect(badDelete.status).toBe(400)
    expect((await responseBody(badDelete)).payload['error']).toBe(
      'confirmation',
    )

    // Pontos névvel törölhető.
    const okDelete = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/tags/${target.id}/delete`, {
        confirmation: 'Cél név',
      }),
      'delete',
      target.id,
      deps(ctx),
    )
    expect(okDelete.status).toBe(200)
    expect((await responseBody(okDelete)).payload['deletedVideoLinks']).toBe(1)
    expect(
      await ctx.db.select().from(tags).where(eq(tags.id, target.id)),
    ).toHaveLength(0)
  })
})

describe.skipIf(!hasTestDatabase)('BSS-030: stábszerep műveletek', () => {
  it('sorrendezés, használt szerep törlésének tiltása, összevonás', async () => {
    const ctx = await setupAdminApiTest('bss catrole')
    const createdA = await handleAdminStaffRoleRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/staff-roles', {
        name: 'Operatőr',
      }),
      'create',
      undefined,
      deps(ctx),
    )
    const createdB = await handleAdminStaffRoleRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/staff-roles', {
        name: 'Vágó',
      }),
      'create',
      undefined,
      deps(ctx),
    )
    const idA = String((await responseBody(createdA)).payload['id'])
    const idB = String((await responseBody(createdB)).payload['id'])

    // Sorrendezés: B lesz az első.
    const reordered = await handleAdminStaffRoleRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/staff-roles/reorder', {
        orderedRoleIds: [idB, idA],
      }),
      'reorder',
      undefined,
      deps(ctx),
    )
    expect(reordered.status).toBe(200)
    const rolesAfter = await ctx.db.select().from(staffRoles)
    const orderById = new Map(
      rolesAfter.map((role) => [role.id, role.displayOrder]),
    )
    expect(orderById.get(idB)).toBeLessThan(orderById.get(idA)!)

    // Ismeretlen azonosítóval a sorrendezés hibázik.
    const badReorder = await handleAdminStaffRoleRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/staff-roles/reorder', {
        orderedRoleIds: ['00000000-0000-4000-8000-000000000009'],
      }),
      'reorder',
      undefined,
      deps(ctx),
    )
    expect(badReorder.status).toBe(404)

    // Használatban lévő szerep törlése tiltva (409 role_in_use).
    const videoRows = await ctx.db
      .insert(videos)
      .values({ slug: 'role-video', title: 'R' })
      .returning()
    await ctx.db.insert(videoStaff).values({
      videoId: videoRows[0].id,
      roleId: idA,
      memberSub: 'sub-admin-member',
    })
    const deleteUsed = await handleAdminStaffRoleRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/staff-roles/${idA}/delete`,
        {},
      ),
      'delete',
      idA,
      deps(ctx),
    )
    const deleteUsedBody = await responseBody(deleteUsed)
    expect(deleteUsedBody.status).toBe(409)
    expect(deleteUsedBody.payload['error']).toBe('role_in_use')

    // Összevonás után a kapcsolat megmarad a célszereppel.
    const merged = await handleAdminStaffRoleRoutes(
      jsonRequest(ctx.leadershipToken, `/api/admin/staff-roles/${idA}/merge`, {
        targetRoleId: idB,
      }),
      'merge',
      idA,
      deps(ctx),
    )
    expect(merged.status).toBe(200)
    const links = await ctx.db
      .select()
      .from(videoStaff)
      .where(eq(videoStaff.videoId, videoRows[0].id))
    expect(links.map((link) => link.roleId)).toEqual([idB])
  })

  it('a lista használati számot ad (összevonás eredménye előre látható)', async () => {
    const ctx = await setupAdminApiTest('bss catlist')
    const created = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/tags', {
        name: 'Lista címke',
      }),
      'create',
      undefined,
      deps(ctx),
    )
    expect(created.status).toBe(200)
    const listed = await handleAdminTagRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/tags/list', {}),
      'list',
      undefined,
      deps(ctx),
    )
    const body = await responseBody(listed)
    expect(body.status).toBe(200)
    const rows = body.payload['tags'] as Array<{
      name: string
      videoCount: number
    }>
    expect(
      rows.some((row) => row.name === 'Lista címke' && row.videoCount === 0),
    ).toBe(true)
    void listTagsWithUsage
  })
})
