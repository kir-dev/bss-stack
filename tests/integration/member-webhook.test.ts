import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  jsonRequest,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import { handleAdminWebhookClientRoutes } from '#/server/api/admin/webhook-client-routes.ts'
import { handleMemberWebhook } from '#/server/api/webhook-routes.ts'
import { getMemberDiagnostics } from '#/server/admin/member-diagnostics.ts'
import {
  getActiveMemberBlocks,
  getMemberArchivePage,
  getMemberProfile,
} from '#/server/pages/members.ts'
import { FakeClock } from '#/lib/clock.ts'
import type { Database } from '#/server/auth/session-store.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

// Each test builds its own migrated database; dropping them right away keeps
// the connection count bounded across this file's many cases.
afterEach(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

type Ctx = Awaited<ReturnType<typeof setupAdminApiTest>>

function adminDeps(ctx: Ctx, clock: FakeClock) {
  return { db: ctx.db, clock, config: testConfig }
}

/** Creates a webhook client through the admin API and returns its bearer token. */
async function createClient(
  ctx: Ctx,
  clock: FakeClock,
  name = 'tagnyilvántartás',
): Promise<{ token: string; id: string }> {
  const response = await handleAdminWebhookClientRoutes(
    jsonRequest(ctx.leadershipToken, '/api/admin/webhook-clients', { name }),
    'create',
    undefined,
    adminDeps(ctx, clock),
  )
  const { status, payload } = await responseBody(response)
  expect(status).toBe(201)
  const client = payload['client'] as { id: string }
  return { token: payload['token'] as string, id: client.id }
}

function pushRequest(
  token: string | null,
  body: unknown,
  options: { deliveryId?: string; rawBody?: string } = {},
): Request {
  return new Request('http://localhost/api/webhooks/members', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      ...(options.deliveryId !== undefined
        ? { 'x-bss-delivery-id': options.deliveryId }
        : {}),
    },
    body: options.rawBody ?? JSON.stringify(body),
  })
}

async function push(
  ctx: Ctx,
  clock: FakeClock,
  token: string | null,
  body: unknown,
  options: { deliveryId?: string; rawBody?: string } = {},
) {
  const response = await handleMemberWebhook(
    pushRequest(token, body, options),
    { db: ctx.db, clock },
  )
  return responseBody(response)
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    sub: '42',
    username: 'gipsz.jakab',
    fullName: 'Gipsz Jakab',
    nickname: 'Pitypang',
    avatarUrl: null,
    membershipStatus: 'MEMBER',
    isLeadership: false,
    joinedSemester: '2019/2020/1',
    ...overrides,
  }
}

async function memberRows(db: Database) {
  const { memberCache } = await import('#/db/schema.ts')
  return db.select().from(memberCache)
}

describe.skipIf(!hasTestDatabase)('webhook kliensek kezelése', () => {
  it('csak vezetőség hozhat létre klienst; a token egyszer jelenik meg', async () => {
    const ctx = await setupAdminApiTest('bss whclient')
    const clock = new FakeClock('2026-08-24T10:00:00Z')

    const anonymous = await handleAdminWebhookClientRoutes(
      jsonRequest(null, '/api/admin/webhook-clients', { name: 'x' }),
      'create',
      undefined,
      adminDeps(ctx, clock),
    )
    expect(anonymous.status).toBe(401)

    const asMember = await handleAdminWebhookClientRoutes(
      jsonRequest(ctx.memberToken, '/api/admin/webhook-clients', { name: 'x' }),
      'create',
      undefined,
      adminDeps(ctx, clock),
    )
    expect(asMember.status).toBe(403)

    const { token, id } = await createClient(ctx, clock)
    expect(token.startsWith(`${id}.`)).toBe(true)

    // Only the hash is persisted; the plaintext secret is unrecoverable.
    const { webhookClients } = await import('#/db/schema.ts')
    const rows = await ctx.db
      .select()
      .from(webhookClients)
      .where(eq(webhookClients.id, id))
    const secret = token.slice(id.length + 1)
    expect(rows.at(0)?.secretHash.startsWith('scrypt$')).toBe(true)
    expect(rows.at(0)?.secretHash.includes(secret)).toBe(false)
  })

  it('azonos név ütközik, a visszavont kliens tokenje már nem érvényes', async () => {
    const ctx = await setupAdminApiTest('bss whrevoke')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token, id } = await createClient(ctx, clock, 'push')

    const duplicate = await handleAdminWebhookClientRoutes(
      jsonRequest(ctx.leadershipToken, '/api/admin/webhook-clients', {
        name: 'push',
      }),
      'create',
      undefined,
      adminDeps(ctx, clock),
    )
    expect(duplicate.status).toBe(409)

    const before = await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(before.status).toBe(200)

    const revoked = await handleAdminWebhookClientRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/webhook-clients/${id}/revoke`,
        {},
      ),
      'revoke',
      id,
      adminDeps(ctx, clock),
    )
    expect(revoked.status).toBe(200)

    const after = await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(after.status).toBe(401)
  })

  it('titokcsere érvényteleníti a régi tokent és feléleszti a klienst', async () => {
    const ctx = await setupAdminApiTest('bss whrotate')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token: oldToken, id } = await createClient(ctx, clock)

    const rotated = await handleAdminWebhookClientRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/webhook-clients/${id}/rotate`,
        {},
      ),
      'rotate',
      id,
      adminDeps(ctx, clock),
    )
    const { payload } = await responseBody(rotated)
    const newToken = payload['token'] as string
    expect(newToken).not.toBe(oldToken)

    const withOld = await push(ctx, clock, oldToken, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(withOld.status).toBe(401)

    const withNew = await push(ctx, clock, newToken, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(withNew.status).toBe(200)
  })
})

describe.skipIf(!hasTestDatabase)('tagfrissítő webhook hitelesítés', () => {
  it('hiányzó, rossz formájú és hibás titkú token is 401', async () => {
    const ctx = await setupAdminApiTest('bss whauth')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token, id } = await createClient(ctx, clock)
    const body = { operations: [{ op: 'upsert', member: member() }] }

    expect((await push(ctx, clock, null, body)).status).toBe(401)
    expect((await push(ctx, clock, 'nincs-pont', body)).status).toBe(401)
    expect((await push(ctx, clock, `${id}.rossz-titok`, body)).status).toBe(401)
    expect(
      (
        await push(
          ctx,
          clock,
          `00000000-0000-4000-8000-000000000000.${token}`,
          body,
        )
      ).status,
    ).toBe(401)

    // No member was written by any of the rejected attempts.
    const rows = await memberRows(ctx.db)
    expect(rows.some((row) => row.sub === '42')).toBe(false)
  })

  it('a GET nem engedélyezett', async () => {
    const ctx = await setupAdminApiTest('bss whmethod')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const response = await handleMemberWebhook(
      new Request('http://localhost/api/webhooks/members'),
      { db: ctx.db, clock },
    )
    expect(response.status).toBe(405)
  })
})

describe.skipIf(!hasTestDatabase)('tagfrissítő webhook műveletek', () => {
  it('létrehoz, módosít és változatlant nem ír újra', async () => {
    const ctx = await setupAdminApiTest('bss whupsert')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const created = await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(created.status).toBe(200)
    expect(created.payload['result']).toMatchObject({
      created: 1,
      updated: 0,
      unchanged: 0,
    })

    clock.advanceMinutes(1)
    const unchanged = await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(unchanged.payload['result']).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    })

    clock.advanceMinutes(1)
    const updated = await push(ctx, clock, token, {
      operations: [
        { op: 'upsert', member: member({ fullName: 'Gipsz Jakab Péter' }) },
      ],
    })
    expect(updated.payload['result']).toMatchObject({
      created: 0,
      updated: 1,
    })

    const rows = await memberRows(ctx.db)
    expect(rows.find((row) => row.sub === '42')?.fullName).toBe(
      'Gipsz Jakab Péter',
    )

    // The unchanged push wrote no audit entry; create + update did.
    const { auditLog } = await import('#/db/schema.ts')
    const audits = await ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, 'member_cache'))
    expect(audits.map((entry) => entry.action).sort()).toEqual([
      'create',
      'update',
    ])
    expect(audits.every((entry) => entry.actor.startsWith('webhook:'))).toBe(
      true,
    )
  })

  it('több művelet egy kérésben, egyetlen tranzakcióban fut', async () => {
    const ctx = await setupAdminApiTest('bss whbatch')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const result = await push(ctx, clock, token, {
      operations: [
        { op: 'upsert', member: member() },
        {
          op: 'upsert',
          member: member({
            sub: '43',
            username: 'nagy.eva',
            fullName: 'Nagy Éva',
          }),
        },
        { op: 'delete', sub: 'nem-letezik' },
      ],
    })
    expect(result.payload['result']).toMatchObject({
      operationCount: 3,
      created: 2,
      ignored: 1,
    })
  })

  it('a törlés puha: a tag eltűnik a publikus oldalakról, de a sora megmarad', async () => {
    const ctx = await setupAdminApiTest('bss whdelete')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    const beforeBlocks = await getActiveMemberBlocks(ctx.db)
    expect(beforeBlocks.studioMembers.some((card) => card.sub === '42')).toBe(
      true,
    )

    clock.advanceMinutes(1)
    const deleted = await push(ctx, clock, token, {
      operations: [{ op: 'delete', sub: '42' }],
    })
    expect(deleted.payload['result']).toMatchObject({ deleted: 1 })

    const afterBlocks = await getActiveMemberBlocks(ctx.db)
    expect(afterBlocks.studioMembers.some((card) => card.sub === '42')).toBe(
      false,
    )
    expect(await getMemberProfile(ctx.db, 'gipsz.jakab')).toBeNull()

    // The row itself survives, so staff credits stay resolvable.
    const rows = await memberRows(ctx.db)
    const row = rows.find((entry) => entry.sub === '42')
    expect(row).toBeDefined()
    expect(row?.deletedAt).not.toBeNull()

    // A repeated delete is a no-op rather than an error.
    clock.advanceMinutes(1)
    const again = await push(ctx, clock, token, {
      operations: [{ op: 'delete', sub: '42' }],
    })
    expect(again.payload['result']).toMatchObject({ deleted: 0, unchanged: 1 })
  })

  it('törölt tag újbóli beküldése visszaállítja', async () => {
    const ctx = await setupAdminApiTest('bss whrestore')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    clock.advanceMinutes(1)
    await push(ctx, clock, token, {
      operations: [{ op: 'delete', sub: '42' }],
    })
    clock.advanceMinutes(1)
    const restored = await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    expect(restored.payload['result']).toMatchObject({ restored: 1 })

    const profile = await getMemberProfile(ctx.db, 'gipsz.jakab')
    expect(profile?.fullName).toBe('Gipsz Jakab')
  })

  it('replace mód törli a névsorból kimaradt tagokat', async () => {
    const ctx = await setupAdminApiTest('bss whreplace')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    await push(ctx, clock, token, {
      operations: [
        { op: 'upsert', member: member() },
        {
          op: 'upsert',
          member: member({
            sub: '43',
            username: 'nagy.eva',
            fullName: 'Nagy Éva',
          }),
        },
      ],
    })

    clock.advanceMinutes(1)
    const replaced = await push(ctx, clock, token, {
      mode: 'replace',
      members: [
        member({ sub: '43', username: 'nagy.eva', fullName: 'Nagy Éva' }),
      ],
    })
    // Replace retires everything absent from the payload — including the three
    // admin fixture profiles. That is the point of the mode.
    expect(replaced.payload['result']).toMatchObject({
      mode: 'replace',
      deleted: 4,
    })

    const blocks = await getActiveMemberBlocks(ctx.db)
    expect(blocks.studioMembers.map((card) => card.sub)).toEqual(['43'])
    expect(blocks.leadership).toHaveLength(0)
  })

  it('az archív listák és a státuszváltás követik a beküldött állapotot', async () => {
    const ctx = await setupAdminApiTest('bss whstatus')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    clock.advanceMinutes(1)
    await push(ctx, clock, token, {
      operations: [
        {
          op: 'upsert',
          member: member({ membershipStatus: 'ALUMNI' }),
        },
      ],
    })

    const blocks = await getActiveMemberBlocks(ctx.db)
    expect(blocks.studioMembers.some((card) => card.sub === '42')).toBe(false)
    const archive = await getMemberArchivePage(ctx.db, 'archived')
    expect(archive.items.map((card) => card.sub)).toEqual(['42'])
  })

  it('a félév ÉÉÉÉ/ÉÉÉÉ/N alakban megy be és ugyanúgy jön vissza', async () => {
    const ctx = await setupAdminApiTest('bss whsemester')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    await push(ctx, clock, token, {
      operations: [
        {
          op: 'upsert',
          member: member({
            sub: '80',
            username: 'oszi',
            joinedSemester: '2021/2022/1',
          }),
        },
        {
          op: 'upsert',
          member: member({
            sub: '81',
            username: 'tavaszi',
            joinedSemester: '2021/2022/2',
          }),
        },
        {
          op: 'upsert',
          member: member({
            sub: '82',
            username: 'nincs',
            joinedSemester: null,
          }),
        },
      ],
    })

    expect((await getMemberProfile(ctx.db, 'oszi'))?.joinedSemester).toBe(
      '2021/2022/1',
    )
    expect((await getMemberProfile(ctx.db, 'tavaszi'))?.joinedSemester).toBe(
      '2021/2022/2',
    )
    expect((await getMemberProfile(ctx.db, 'nincs'))?.joinedSemester).toBeNull()

    // Internally the semester is still a calendar year plus spring/autumn.
    const rows = await memberRows(ctx.db)
    const autumn = rows.find((row) => row.username === 'oszi')
    const spring = rows.find((row) => row.username === 'tavaszi')
    expect(autumn?.joinedYear).toBe(2021)
    expect(autumn?.joinedSemester).toBe('autumn')
    expect(spring?.joinedYear).toBe(2022)
    expect(spring?.joinedSemester).toBe('spring')

    const diagnostics = await getMemberDiagnostics(ctx.db)
    expect(
      diagnostics.profiles.find((profile) => profile.username === 'oszi')
        ?.joinedSemester,
    ).toBe('2021/2022/1')
  })

  it('a bemutatkozás nem része az API-nak: a tárolt szöveg érintetlen marad', async () => {
    const ctx = await setupAdminApiTest('bss whintro')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)
    const { memberCache } = await import('#/db/schema.ts')

    await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })

    // A bio can still reach the column by other means; the webhook must not
    // clear it on the next push.
    await ctx.db
      .update(memberCache)
      .set({ introduction: 'Korábban rögzített bemutatkozás.' })
      .where(eq(memberCache.sub, '42'))

    clock.advanceMinutes(1)
    const updated = await push(ctx, clock, token, {
      operations: [
        { op: 'upsert', member: member({ fullName: 'Gipsz Jakab Péter' }) },
      ],
    })
    expect(updated.payload['result']).toMatchObject({ updated: 1 })

    const profile = await getMemberProfile(ctx.db, 'gipsz.jakab')
    expect(profile?.fullName).toBe('Gipsz Jakab Péter')
    expect(profile?.introduction).toBe('Korábban rögzített bemutatkozás.')
  })

  it('a beküldött introduction mezőt a szerver figyelmen kívül hagyja', async () => {
    const ctx = await setupAdminApiTest('bss whintroignore')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const response = await push(ctx, clock, token, {
      operations: [
        {
          op: 'upsert',
          member: { ...member(), introduction: 'Nem kerül tárolásra.' },
        },
      ],
    })
    // Not rejected, but not stored either.
    expect(response.status).toBe(200)
    const profile = await getMemberProfile(ctx.db, 'gipsz.jakab')
    expect(profile?.introduction).toBeNull()
  })

  it('a nem egymást követő évszám és a régi alak elutasított', async () => {
    const ctx = await setupAdminApiTest('bss whsemesterbad')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    for (const value of ['2021/2023/1', '2021 ősz', '2021/2022/3']) {
      const response = await push(ctx, clock, token, {
        operations: [
          { op: 'upsert', member: member({ joinedSemester: value }) },
        ],
      })
      expect(response.status).toBe(400)
      expect((response.payload['problems'] as string[]).join(' ')).toContain(
        'joinedSemester',
      )
    }

    expect((await memberRows(ctx.db)).some((row) => row.sub === '42')).toBe(
      false,
    )
  })
})

describe.skipIf(!hasTestDatabase)('tagfrissítő webhook validáció', () => {
  it('hibás mezőkre 400 és minden problémát felsorol; semmit nem ír', async () => {
    const ctx = await setupAdminApiTest('bss whvalid')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const response = await push(ctx, clock, token, {
      operations: [
        {
          op: 'upsert',
          member: member({
            username: '',
            membershipStatus: 'nincs-ilyen',
            joinedSemester: '2021 ősz',
          }),
        },
      ],
    })
    expect(response.status).toBe(400)
    const problems = response.payload['problems'] as string[]
    expect(problems.some((p) => p.includes('username'))).toBe(true)
    expect(problems.some((p) => p.includes('membershipStatus'))).toBe(true)
    expect(problems.some((p) => p.includes('joinedSemester'))).toBe(true)

    expect((await memberRows(ctx.db)).some((row) => row.sub === '42')).toBe(
      false,
    )

    // The rejection is visible on the admin panel.
    const diagnostics = await getMemberDiagnostics(ctx.db)
    expect(diagnostics.summary.recentRejections).toBe(1)
    expect(diagnostics.deliveries.at(0)?.status).toBe('rejected')
  })

  it('érvénytelen JSON és ismeretlen művelet 400', async () => {
    const ctx = await setupAdminApiTest('bss whbadjson')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const badJson = await push(ctx, clock, token, null, {
      rawBody: '{nem-json',
    })
    expect(badJson.status).toBe(400)

    const badOp = await push(ctx, clock, token, {
      operations: [{ op: 'patch', sub: '42' }],
    })
    expect(badOp.status).toBe(400)

    const emptyOps = await push(ctx, clock, token, { operations: [] })
    expect(emptyOps.status).toBe(400)
  })

  it('egy kérésen belüli ismételt sub elutasított', async () => {
    const ctx = await setupAdminApiTest('bss whdupsub')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const response = await push(ctx, clock, token, {
      operations: [
        { op: 'upsert', member: member() },
        { op: 'delete', sub: '42' },
      ],
    })
    expect(response.status).toBe(400)
    expect((response.payload['problems'] as string[]).join(' ')).toContain(
      'csak egyszer szerepelhet',
    )
  })

  it('ütköző felhasználónévre 409, nem 500', async () => {
    const ctx = await setupAdminApiTest('bss whconflict')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })
    clock.advanceMinutes(1)
    const conflict = await push(ctx, clock, token, {
      operations: [
        {
          op: 'upsert',
          member: member({ sub: '99', fullName: 'Másik Ember' }),
        },
      ],
    })
    expect(conflict.status).toBe(409)

    // The colliding push left the existing member untouched.
    const rows = await memberRows(ctx.db)
    expect(rows.filter((row) => row.username === 'gipsz.jakab')).toHaveLength(1)
    expect(rows.some((row) => row.sub === '99')).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)('tagfrissítő webhook idempotencia', () => {
  it('ugyanaz a delivery azonosító nem fut le kétszer', async () => {
    const ctx = await setupAdminApiTest('bss whidem')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const first = await push(
      ctx,
      clock,
      token,
      { operations: [{ op: 'upsert', member: member() }] },
      { deliveryId: 'delivery-1' },
    )
    expect(first.payload['duplicate']).toBe(false)
    expect(first.payload['result']).toMatchObject({ created: 1 })

    clock.advanceMinutes(1)
    const retry = await push(
      ctx,
      clock,
      token,
      {
        operations: [
          { op: 'upsert', member: member({ fullName: 'Átírt Név' }) },
        ],
      },
      { deliveryId: 'delivery-1' },
    )
    expect(retry.status).toBe(200)
    expect(retry.payload['duplicate']).toBe(true)

    // The retried body was not applied.
    const rows = await memberRows(ctx.db)
    expect(rows.find((row) => row.sub === '42')?.fullName).toBe('Gipsz Jakab')
  })

  it('elutasított beküldés után ugyanaz a delivery azonosító újrapróbálható', async () => {
    const ctx = await setupAdminApiTest('bss whretry')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token } = await createClient(ctx, clock)

    const rejected = await push(
      ctx,
      clock,
      token,
      { operations: [{ op: 'upsert', member: member({ username: '' }) }] },
      { deliveryId: 'delivery-2' },
    )
    expect(rejected.status).toBe(400)

    clock.advanceMinutes(1)
    const fixed = await push(
      ctx,
      clock,
      token,
      { operations: [{ op: 'upsert', member: member() }] },
      { deliveryId: 'delivery-2' },
    )
    expect(fixed.status).toBe(200)
    expect(fixed.payload['duplicate']).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)('tagadminisztráció diagnosztikája', () => {
  it('összesíti a profilokat, a klienseket és a beérkezéseket', async () => {
    const ctx = await setupAdminApiTest('bss whdiag')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token, id } = await createClient(ctx, clock, 'push')

    await push(ctx, clock, token, {
      operations: [
        { op: 'upsert', member: member() },
        {
          op: 'upsert',
          member: member({
            sub: '43',
            username: 'nagy.eva',
            fullName: 'Nagy Éva',
          }),
        },
      ],
    })
    clock.advanceMinutes(1)
    await push(ctx, clock, token, {
      operations: [{ op: 'delete', sub: '43' }],
    })

    const data = await getMemberDiagnostics(ctx.db)
    // The three admin fixture profiles plus the two pushed members.
    expect(data.summary.total).toBe(5)
    expect(data.summary.deleted).toBe(1)
    expect(data.summary.active).toBe(4)
    expect(data.summary.activeClients).toBe(1)
    expect(data.summary.lastDeliveryStatus).toBe('ok')
    expect(data.deliveries).toHaveLength(2)
    expect(data.deliveries.at(0)?.clientName).toBe('push')
    expect(data.clients.map((client) => client.id)).toEqual([id])

    // Never expose the stored secret through the admin payload.
    expect(JSON.stringify(data).includes('secretHash')).toBe(false)
  })

  it('a kliens törlése a beérkezési naplóját is elviszi', async () => {
    const ctx = await setupAdminApiTest('bss whdelclient')
    const clock = new FakeClock('2026-08-24T10:00:00Z')
    const { token, id } = await createClient(ctx, clock)
    await push(ctx, clock, token, {
      operations: [{ op: 'upsert', member: member() }],
    })

    const response = await handleAdminWebhookClientRoutes(
      jsonRequest(
        ctx.leadershipToken,
        `/api/admin/webhook-clients/${id}/delete`,
        {},
      ),
      'delete',
      id,
      adminDeps(ctx, clock),
    )
    expect(response.status).toBe(200)

    const data = await getMemberDiagnostics(ctx.db)
    expect(data.clients).toHaveLength(0)
    expect(data.deliveries).toHaveLength(0)
    // The member the client pushed stays: the data is the app's own now.
    expect((await memberRows(ctx.db)).some((row) => row.sub === '42')).toBe(
      true,
    )
  })
})
