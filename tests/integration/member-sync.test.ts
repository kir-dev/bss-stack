import { afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { auditLog } from '#/db/schema.ts'
import { FakeClock } from '#/lib/clock.ts'
import {
  runMemberSync,
  triggerManualMemberSync,
} from '#/server/members/sync.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { installFetchMock } from '../helpers/http-mock.ts'
import type { FetchMock, MockRoute } from '../helpers/http-mock.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const testConfig = validateOobConfig(buildRawOobConfig())
const GROUP = testConfig.authentik.groups
const ISSUER = 'https://authentik.local/application/o/bss'

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

interface ApiUserFixture {
  pk: number
  username: string
  name: string
  isActive?: boolean
  type?: string
  attributes?: Record<string, unknown>
  groups?: string[]
}

function apiUser(fixture: ApiUserFixture): Record<string, unknown> {
  return {
    pk: fixture.pk,
    username: fixture.username,
    name: fixture.name,
    is_active: fixture.isActive ?? true,
    type: fixture.type ?? 'internal',
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
      attributes: {
        bss_status: 'stúdiós',
        bss_csatlakozas: '2023 ősz',
        bss_bemutatkozas: 'Bemutatkozás szöveg.',
        nickname: 'Tagocska',
      },
      groups: [GROUP_UUIDS[GROUP.tag]],
    },
    {
      pk: 37,
      username: 'vezetoseg-dev',
      name: 'Teszt Vezetőségi Tag',
      attributes: { bss_status: 'stúdiós', bss_csatlakozas: '2021 tavasz' },
      groups: [GROUP_UUIDS[GROUP.tag], GROUP_UUIDS[GROUP.vezetoseg]],
    },
  ]
}

/** Az Authentik API-t mockolja (token + lapozott users/groups). */
function mockAuthentik(users: ApiUserFixture[]): FetchMock {
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
        status: 200,
        body: {
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
        body: {
          pagination: { next: 0 },
          results: users.map(apiUser),
        },
      }),
    },
  ]
  return installFetchMock(routes)
}

async function setupSync(): Promise<{
  db: NodePgDatabase<Record<string, never>>
  clock: FakeClock
}> {
  const migrated = await createMigratedTestDatabase('bss_sync')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return { db: migrated.db, clock: new FakeClock('2026-06-01T10:00:00.000Z') }
}

describe.skipIf(!hasTestDatabase)(
  'BSS-008: Authentik tagcache és szinkron',
  () => {
    it('első szinkron feltölti a cache-t érvényes adatokkal', async () => {
      const { db, clock } = await setupSync()
      const mock = mockAuthentik(defaultUsers())

      const result = await runMemberSync('startup', {
        db,
        clock,
        loadConfig: () => testConfig,
      })

      expect(result.status).toBe('ok')
      expect(result.totalCount).toBe(2)
      expect(result.changedCount).toBe(2)
      expect(result.errorCount).toBe(0)

      const client = (db as unknown as { $client: Pool }).$client
      const rows = await client.query<{
        sub: string
        username: string
        membership_status: string
        is_leadership: boolean
        joined_year: number
        joined_semester: string
        introduction: string | null
        sync_status: string
      }>('select * from member_cache order by username')

      expect(rows.rows.map((row) => row.username)).toEqual([
        'tag-dev',
        'vezetoseg-dev',
      ])
      const tagRow = rows.rows.find((row) => row.username === 'tag-dev')!
      expect(tagRow.sub).toBe('36')
      expect(tagRow.membership_status).toBe('studio_member')
      expect(tagRow.is_leadership).toBe(false)
      expect(tagRow.joined_year).toBe(2023)
      expect(tagRow.joined_semester).toBe('autumn')
      expect(tagRow.introduction).toBe('Bemutatkozás szöveg.')
      const leadershipRow = rows.rows.find(
        (row) => row.username === 'vezetoseg-dev',
      )!
      expect(leadershipRow.is_leadership).toBe(true)

      // A szinkron az Authentik API-t hívta (nem a publikus oldal):
      expect(
        mock.calls().some((call) => call.url.includes('/api/v3/core/users')),
      ).toBe(true)
      mock.restore()
    })

    it('szerepváltozás frissíti a rekordot és változatlan szinkron nem ír auditot', async () => {
      const { db, clock } = await setupSync()
      const mock = mockAuthentik(defaultUsers())
      await runMemberSync('hourly', { db, clock, loadConfig: () => testConfig })

      // Második, változatlan futás:
      await runMemberSync('hourly', { db, clock, loadConfig: () => testConfig })
      const unchangedAudits = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.actor, 'system'),
            eq(auditLog.entityType, 'member_cache'),
          ),
        )
      // Csak az első (létrehozó) futás írt auditot:
      expect(unchangedAudits).toHaveLength(2)

      // Szerepváltozás: tag-dev bekerül a vezetőségi csoportba.
      mock.restore()
      const changedUsers = defaultUsers().map((user) =>
        user.username === 'tag-dev'
          ? {
              ...user,
              groups: [GROUP_UUIDS[GROUP.tag], GROUP_UUIDS[GROUP.vezetoseg]],
            }
          : user,
      )
      const secondMock = mockAuthentik(changedUsers)
      const secondResult = await runMemberSync('hourly', {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      expect(secondResult.changedCount).toBe(1)

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'update'))
      expect(audits).toHaveLength(1)
      const updateAudit = audits[0]
      expect(updateAudit.beforeValue).toMatchObject({ isLeadership: false })
      expect(updateAudit.afterValue).toMatchObject({ isLeadership: true })
      secondMock.restore()
    })

    it('eltűnt tag utolsó ismert rekordja megmarad', async () => {
      const { db, clock } = await setupSync()
      const firstMock = mockAuthentik(defaultUsers())
      await runMemberSync('manual', { db, clock, loadConfig: () => testConfig })
      firstMock.restore()

      const withoutVezetoseg = defaultUsers().filter(
        (u) => u.username !== 'vezetoseg-dev',
      )
      const secondMock = mockAuthentik(withoutVezetoseg)
      await runMemberSync('manual', { db, clock, loadConfig: () => testConfig })
      secondMock.restore()

      // A táblában maradnia kell mindkét sornak; ellenőrzés nyers SQL-lel:
      const client = (db as unknown as { $client: Pool }).$client
      const remaining = await client.query<{ username: string }>(
        'select username from member_cache order by username',
      )
      expect(remaining.rows.map((row) => row.username)).toEqual([
        'tag-dev',
        'vezetoseg-dev',
      ])
    })

    it('hibás profil nem kerül publikus csoportba, de javuláskor visszatér', async () => {
      const { db, clock } = await setupSync()

      // Ismeretlen státuszú új tag: nem jön létre sor.
      const withInvalid = [
        ...defaultUsers(),
        {
          pk: 50,
          username: 'uj-tag',
          name: 'Új Tag Érvénytelen Státusszal',
          attributes: { bss_status: 'nem létező státusz' },
          groups: [GROUP_UUIDS[GROUP.tag]],
        },
      ]
      const firstMock = mockAuthentik(withInvalid)
      const firstResult = await runMemberSync('manual', {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      expect(firstResult.errorCount).toBe(1)
      expect(firstResult.totalCount).toBe(3)
      firstMock.restore()

      const client = (db as unknown as { $client: Pool }).$client
      const invalidRow = await client.query(
        'select sub from member_cache where username = $1',
        ['uj-tag'],
      )
      expect(invalidRow.rowCount).toBe(0)

      // Korábban jó profil romlik el: utolsó adat megmarad, hibás jelölést kap.
      const corrupted = defaultUsers().map((user) =>
        user.username === 'tag-dev'
          ? { ...user, attributes: { bss_status: 'megváltozott-e' } }
          : user,
      )
      const secondMock = mockAuthentik(corrupted)
      const secondResult = await runMemberSync('manual', {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      expect(secondResult.changedCount).toBe(1)
      secondMock.restore()

      const kept = await client.query<{
        sync_status: string
        full_name: string
        membership_status: string
      }>(
        'select sync_status, full_name, membership_status from member_cache where username=$1',
        ['tag-dev'],
      )
      expect(kept.rows[0]?.sync_status).toBe('error')
      expect(kept.rows[0]?.full_name).toBe('Teszt BSS Tag')
      expect(kept.rows[0]?.membership_status).toBe('studio_member')

      // Javuláskor visszatér az ok állapot.
      const thirdMock = mockAuthentik(defaultUsers())
      const thirdResult = await runMemberSync('manual', {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      expect(thirdResult.changedCount).toBeGreaterThanOrEqual(1)
      thirdMock.restore()
      const healed = await client.query<{ sync_status: string }>(
        'select sync_status from member_cache where username=$1',
        ['tag-dev'],
      )
      expect(healed.rows[0]?.sync_status).toBe('ok')
    })

    it('kézi szinkront csak vezetőség indíthat', async () => {
      const { db, clock } = await setupSync()
      const memberViewer: Viewer = {
        level: 'member',
        sub: '36',
        username: 'tag-dev',
      }

      const mock = mockAuthentik(defaultUsers())
      await expect(
        triggerManualMemberSync(memberViewer, {
          db,
          clock,
          loadConfig: () => testConfig,
        }),
      ).rejects.toThrow(ForbiddenError)

      const leadershipViewer: Viewer = {
        level: 'leadership',
        sub: '37',
        username: 'vezetoseg-dev',
      }
      const result = await triggerManualMemberSync(leadershipViewer, {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      expect(result.trigger).toBe('manual')
      expect(result.status).toBe('ok')
      void anonymousViewer
      mock.restore()
    })

    it('Authentik-kiesésnél a futás hibás státusszal zárul, a meglévő cache érintetlen marad', async () => {
      const { db, clock } = await setupSync()
      const seedMock = mockAuthentik(defaultUsers())
      await runMemberSync('startup', {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      seedMock.restore()

      const failingMock = installFetchMock([
        {
          method: 'POST',
          urlPattern: /\/token/,
          respond: () => {
            throw new Error('connection refused')
          },
        },
      ])
      const failed = await runMemberSync('hourly', {
        db,
        clock,
        loadConfig: () => testConfig,
      })
      expect(failed.status).toBe('error')
      expect(failed.message).toContain('Authentik')
      failingMock.restore()

      const client = (db as unknown as { $client: Pool }).$client
      const stillThere = await client.query(
        'select count(*)::int as c from member_cache',
      )
      expect(stillThere.rows[0]?.c).toBe(2)

      const runs = await client.query<{ trigger: string; status: string }>(
        'select trigger, status from member_sync_runs order by id',
      )
      expect(runs.rows.map((row) => row.status)).toEqual(['ok', 'error'])
    })
  },
)
