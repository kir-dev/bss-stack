import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  jsonRequest,
  responseBody,
  setupAdminApiTest,
  testConfig,
} from '../helpers/admin-api.ts'
import { handleAdminMemberSyncRoute } from '#/server/api/admin/member-routes.ts'
import { getMemberDiagnostics } from '#/server/admin/member-diagnostics.ts'
import { FakeClock } from '#/lib/clock.ts'
import { installFetchMock } from '../helpers/http-mock.ts'
import type { FetchMock, MockRoute } from '../helpers/http-mock.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)
const GROUP = testConfig.authentik.groups
const ISSUER = 'https://authentik.local/application/o/bss'

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

interface ApiUserFixture {
  pk: number
  username: string
  name: string
  attributes?: Record<string, unknown>
  groups?: string[]
}

function apiUser(fixture: ApiUserFixture): Record<string, unknown> {
  return {
    pk: fixture.pk,
    username: fixture.username,
    name: fixture.name,
    is_active: true,
    type: 'internal',
    avatar: null,
    attributes: fixture.attributes ?? {},
    groups: fixture.groups ?? [],
  }
}

const GROUP_UUIDS: Record<string, string> = {
  [GROUP.schonherz]: '11111111-1111-4111-8111-111111111111',
  [GROUP.tag]: '22222222-2222-4222-8222-222222222222',
  [GROUP.vezetoseg]: '33333333-3333-4333-8333-333333333333',
}

function defaultUsers(): ApiUserFixture[] {
  return [
    {
      pk: 36,
      username: 'tag-dev',
      name: 'Teszt BSS Tag',
      attributes: { bss_status: 'stúdiós', bss_csatlakozas: '2023 ősz' },
      groups: [GROUP_UUIDS[GROUP.tag]],
    },
    {
      pk: 37,
      username: 'vezetoseg-dev',
      name: 'Teszt Vezetőségi Tag',
      attributes: { bss_status: 'stúdiós', bss_csatlakozas: '2021 tavasz' },
      groups: [GROUP_UUIDS[GROUP.tag], GROUP_UUIDS[GROUP.vezetoseg]],
    },
    {
      // Ismeretlen státusz → szinkronhiba.
      pk: 38,
      username: 'hibas-profil',
      name: 'Hibás Profil',
      attributes: {
        bss_status: 'ismeretlen-statusz',
        bss_csatlakozas: '2020 ősz',
      },
      groups: [GROUP_UUIDS[GROUP.tag]],
    },
  ]
}

/** Az Authentik API-t mockolja; `failToken` esetén a token hívás hibázik. */
function mockAuthentik(
  users: ApiUserFixture[],
  options: { failToken?: boolean } = {},
): FetchMock {
  const routes: MockRoute[] = [
    {
      urlPattern: /\.well-known\/openid-configuration/,
      respond: () => ({
        status: 200,
        body: {
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
        },
      }),
    },
    {
      method: 'POST',
      urlPattern: /\/token/,
      respond: () => ({
        status: options.failToken === true ? 503 : 200,
        body:
          options.failToken === true
            ? { detail: 'service unavailable' }
            : {
                access_token: 'sync-access-token',
                scope: 'goauthentik.io/api',
              },
      }),
    },
    {
      method: 'GET',
      urlPattern: /core\/groups/,
      respond: () => ({
        status: 200,
        body: {
          pagination: { next: 0 },
          results: Object.entries(GROUP_UUIDS).map(([name, pk]) => ({
            pk,
            name,
          })),
        },
      }),
    },
    {
      method: 'GET',
      urlPattern: /core\/users/,
      respond: () => ({
        status: 200,
        body: { pagination: { next: 0 }, results: users.map(apiUser) },
      }),
    },
  ]
  return installFetchMock(routes)
}

function syncDeps(
  ctx: Awaited<ReturnType<typeof setupAdminApiTest>>,
  clock: FakeClock,
) {
  return {
    db: ctx.db,
    clock,
    config: testConfig,
    loadConfig: () => testConfig,
  }
}

describe.skipIf(!hasTestDatabase)('BSS-032: kézi szinkron jogosultság', () => {
  it('névtelen 401, tag 403 — API-n is tiltott', async () => {
    const ctx = await setupAdminApiTest('bss diagauth')
    const anonymousResponse = await handleAdminMemberSyncRoute(
      jsonRequest(null, '/api/admin/members/sync', {}),
      syncDeps(ctx, new FakeClock()),
    )
    expect(anonymousResponse.status).toBe(401)

    const memberResponse = await handleAdminMemberSyncRoute(
      jsonRequest(ctx.memberToken, '/api/admin/members/sync', {}),
      syncDeps(ctx, new FakeClock()),
    )
    expect(memberResponse.status).toBe(403)

    // A szinkron nem futott le: a tesztprofilokon kívül nincs cache-sor.
    const schema = await import('#/db/schema.ts')
    const cacheRows = await ctx.db.select().from(schema.memberCache)
    expect(cacheRows.some((row) => row.username === 'tag-dev')).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)(
  'BSS-032: vezetőségi kézi szinkron és diagnosztika',
  () => {
    it('kézi szinkron feltölti a cache-t, rögzíti a futást és auditál', async () => {
      const ctx = await setupAdminApiTest('bss diagsync')
      const clock = new FakeClock('2026-08-24T10:00:00Z')
      const fetchMock = mockAuthentik(defaultUsers())

      const response = await handleAdminMemberSyncRoute(
        jsonRequest(ctx.leadershipToken, '/api/admin/members/sync', {}),
        syncDeps(ctx, clock),
      )
      const { status, payload } = await responseBody(response)
      expect(status).toBe(200)
      expect(payload['ok']).toBe(true)
      const result = payload['result'] as Record<string, unknown>
      expect(result['trigger']).toBe('manual')
      expect(result['totalCount']).toBe(3)
      expect(result['errorCount']).toBe(1)

      const cacheRows = await ctx.db
        .select()
        .from((await import('#/db/schema.ts')).memberCache)
      expect(cacheRows.length).toBeGreaterThanOrEqual(2)

      const runRows = await ctx.db
        .select()
        .from((await import('#/db/schema.ts')).memberSyncRuns)
      expect(runRows).toHaveLength(1)
      expect(runRows.at(0)?.trigger).toBe('manual')

      const audits = await ctx.db
        .select()
        .from((await import('#/db/schema.ts')).auditLog)
      expect(audits.length).toBeGreaterThan(0)
      void fetchMock
    })

    it('a diagnosztika jelzi a hibás profilokat és az eltűnt tagokat', async () => {
      const ctx = await setupAdminApiTest('bss diagview')
      const clock = new FakeClock('2026-08-24T11:00:00Z')

      // Korábban már ismert profil, amely most ismeretlen státuszúvá válik.
      const schema0 = await import('#/db/schema.ts')
      await ctx.db.insert(schema0.memberCache).values({
        sub: '38',
        username: 'hibas-profil',
        fullName: 'Hibás Profil',
        nickname: null,
        avatarUrl: null,
        membershipStatus: 'studio_member',
        isLeadership: false,
        joinedYear: 2020,
        joinedSemester: 'autumn',
        joinedSemesterRaw: '2020 ősz',
        introduction: null,
        syncStatus: 'ok',
        lastSyncError: null,
        lastSeenAt: new Date('2026-06-01T00:00:00Z'),
        updatedAt: new Date('2026-06-01T00:00:00Z'),
      })

      mockAuthentik(defaultUsers())
      await handleAdminMemberSyncRoute(
        jsonRequest(ctx.leadershipToken, '/api/admin/members/sync', {}),
        syncDeps(ctx, clock),
      )

      // A korábban ok profilt az ismeretlen státusz hibásra váltja
      // (utolsó ismert adata megmarad).
      let data = await getMemberDiagnostics(ctx.db)
      expect(data.summary.errorProfiles).toBe(1)
      expect(data.summary.lastRunStatus).toBe('ok')
      const errorProfile = data.profiles.find(
        (profile) => profile.syncStatus === 'error',
      )
      expect(errorProfile?.username).toBe('hibas-profil')

      // Eltűnés-szimuláció: egy profil lastSeenAt-jét a futás elé húzzuk.
      const schema = await import('#/db/schema.ts')
      await ctx.db
        .update(schema.memberCache)
        .set({ lastSeenAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(schema.memberCache.username, 'tag-dev'))
      data = await getMemberDiagnostics(ctx.db)
      const tagDev = data.profiles.find(
        (profile) => profile.username === 'tag-dev',
      )
      expect(tagDev?.likelyVanished).toBe(true)
      expect(data.summary.likelyVanished).toBeGreaterThanOrEqual(1)
    })

    it('Authentik-kiesésnél a hiba rögzül, de nem szivárogtat titkot', async () => {
      const ctx = await setupAdminApiTest('bss diagoutage')
      const clock = new FakeClock('2026-08-24T12:00:00Z')
      mockAuthentik(defaultUsers(), { failToken: true })

      const response = await handleAdminMemberSyncRoute(
        jsonRequest(ctx.leadershipToken, '/api/admin/members/sync', {}),
        syncDeps(ctx, clock),
      )
      const body = await responseBody(response)
      expect(body.status).toBe(200)
      expect(body.payload['ok']).toBe(false)

      const data = await getMemberDiagnostics(ctx.db)
      expect(data.summary.lastRunStatus).toBe('error')
      // Az access token nem kerülhet a hibaüzenetbe vagy a diagnosztikába.
      const serialized = JSON.stringify(data)
      expect(serialized.includes('sync-access-token')).toBe(false)
    })
  },
)
