import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { SESSION_COOKIE_NAME } from '#/server/auth/session-cookies.ts'
import { createAuthSession } from '#/server/auth/session-store.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from './oob-config.ts'
import { createMigratedTestDatabase } from './test-db.ts'

export const testConfig = validateOobConfig(buildRawOobConfig())

export interface AdminTestContext {
  db: NodePgDatabase<Record<string, never>>
  memberToken: string
  leadershipToken: string
  schonherzToken: string
}

const databases: Array<{ drop: () => Promise<void> }> = []
const poolCleanups: Array<() => Promise<void>> = []

export function registerCleanup(
  database: { drop: () => Promise<void> },
  pool: PoolLike,
): void {
  // A DROP DATABASE WITH FORCE lecsatolhatja a még élő backendet;
  // az ilyenkor érkező connection-hibát elnyeljük (a teszt már kész volt).
  pool.on('error', () => {})
  databases.push(database)
  poolCleanups.push(() => pool.end())
}

interface PoolLike {
  end: () => Promise<void>
  on: (event: 'error', listener: (error: Error) => void) => unknown
}

export async function dropAll(): Promise<void> {
  while (poolCleanups.length > 0) {
    await poolCleanups.pop()!()
  }
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
}

/** Admin API integrációs tesztek közös alapja: migrált DB + három session. */
export async function setupAdminApiTest(
  prefix = 'bss_adminapi',
): Promise<AdminTestContext> {
  const migrated = await createMigratedTestDatabase(prefix)
  registerCleanup(migrated.database, migrated.pool)
  const db = migrated.db

  const groups = testConfig.authentik.groups
  // A created_by/updated_by/trashed_by idegen kulccsal hivatkozik a
  // member_cache-re, ezért a tesztprofilokat fel kell vinni.
  const { memberCache } = await import('#/db/schema.ts')
  const now = new Date('2026-06-01T10:00:00Z')
  await db.insert(memberCache).values([
    {
      sub: 'sub-admin-member',
      username: 'adminmember',
      fullName: 'Admin Tag',
      nickname: null,
      avatarUrl: null,
      membershipStatus: 'MEMBER',
      isLeadership: false,
      joinedYear: 2023,
      joinedSemester: 'autumn',
      introduction: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      sub: 'sub-admin-leader',
      username: 'adminleader',
      fullName: 'Admin Vezetőség',
      nickname: null,
      avatarUrl: null,
      membershipStatus: 'MEMBER',
      isLeadership: true,
      joinedYear: 2022,
      joinedSemester: 'autumn',
      introduction: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      sub: 'sub-admin-schonherz',
      username: 'adminsch',
      fullName: 'Admin Schönherz',
      nickname: null,
      avatarUrl: null,
      membershipStatus: 'MEMBER',
      isLeadership: false,
      joinedYear: 2024,
      joinedSemester: 'spring',
      introduction: null,
      createdAt: now,
      updatedAt: now,
    },
  ])

  const [member, leadership, schonherz] = await Promise.all([
    createSession(db, 'sub-admin-member', 'adminmember', [groups.studio]),
    createSession(db, 'sub-admin-leader', 'adminleader', [groups.leadership]),
    createSession(db, 'sub-admin-schonherz', 'adminsch', []),
  ])
  return {
    db,
    memberToken: member,
    leadershipToken: leadership,
    schonherzToken: schonherz,
  }
}

async function createSession(
  db: Database,
  sub: string,
  username: string,
  groups: string[],
): Promise<string> {
  const created = await createAuthSession(
    { memberSub: sub, username, groups, accessToken: null },
    { db },
  )
  return created.token
}

export function jsonRequest(
  token: string | null,
  path: string,
  body?: Record<string, unknown>,
): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
}

export async function responseBody(response: Response): Promise<{
  status: number
  payload: Record<string, unknown>
}> {
  return {
    status: response.status,
    payload: (await response.json()) as Record<string, unknown>,
  }
}

/** Elérhető média választ adó fetch-mock (HEAD 200, helyes content-type). */
export function reachableMediaFetch(): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input)
    return new Response(null, {
      status: 200,
      headers: {
        'content-type': url.includes('.mp4') ? 'video/mp4' : 'image/jpeg',
      },
    })
  }
}

/** Átirányító média válasz (tiltott publikáláshoz). */
export function redirectingMediaFetch(): typeof fetch {
  return async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://bsstudio.hu/' },
    })
}
