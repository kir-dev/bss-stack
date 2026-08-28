import { afterAll, describe, expect, it } from 'vitest'
import {
  adminAreaAccess,
  leadershipAreaAccess,
} from '#/server/pages/admin/access.ts'
import { anonymousViewer } from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { SESSION_COOKIE_NAME } from '#/server/auth/session-cookies.ts'
import { createAuthSession } from '#/server/auth/session-store.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)
const config = validateOobConfig(buildRawOobConfig())

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

async function setupDb(): Promise<Database> {
  const migrated = await createMigratedTestDatabase('bss_adminacc')
  databases.push(migrated.database)
  poolCleanups.push(() => migrated.pool.end())
  return migrated.db
}

function viewerFor(level: Viewer['level'], sub: string | null): Viewer {
  return { level, sub, username: sub === null ? null : `user-${level}` }
}

function requestWithCookie(token: string): Request {
  return new Request('http://localhost/admin/videos', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  })
}

describe('BSS-027: admin terület guard (pure döntés)', () => {
  it('névtelen felhasználó belépésre irányul a megtartott returnTo-val', () => {
    const access = adminAreaAccess(anonymousViewer(), '/admin/videos')
    expect(access.kind).toBe('login')
    if (access.kind === 'login') {
      expect(access.loginUrl).toContain(encodeURIComponent('/admin/videos'))
      expect(access.loginUrl.startsWith('/api/auth/login?returnTo=')).toBe(true)
    }
  })

  it('schönherz felhasználó magyar tiltást kap', () => {
    const access = adminAreaAccess(viewerFor('schonherz', 'sub-sch'), '/admin')
    expect(access.kind).toBe('forbidden')
  })

  it('tag beléphet az admin területre', () => {
    const access = adminAreaAccess(viewerFor('member', 'sub-member'), '/admin')
    expect(access.kind).toBe('ok')
  })

  it('vezetőség beléphet, és minden vezetőségi területet elér', () => {
    const viewer = viewerFor('leadership', 'sub-lead')
    expect(adminAreaAccess(viewer, '/admin').kind).toBe('ok')
    expect(leadershipAreaAccess(viewer).kind).toBe('ok')
  })

  it('tag a vezetőségi oldalakról kizárásra kerül (közvetlen URL is tiltva)', () => {
    const access = leadershipAreaAccess(viewerFor('member', 'sub-member'))
    expect(access.kind).toBe('forbidden')
  })

  it('névtelen a vezetőségi oldalon belépésre irányítódik', () => {
    const access = leadershipAreaAccess(anonymousViewer())
    expect(access.kind).toBe('login')
  })
})

describe.skipIf(!hasTestDatabase)('BSS-027: guard valódi sessionnel', () => {
  it('tag sessionnel az admin elérhető, schonherz nem', async () => {
    const db = await setupDb()

    const member = await createAuthSession(
      {
        memberSub: 'sub-admin-member',
        username: 'adminmember',
        groups: [config.authentik.groups.tag],
        accessToken: null,
      },
      { db },
    )
    const memberState = await resolveViewerStateFromRequest(
      requestWithCookie(member.token),
      { db, config },
    )
    expect(adminAreaAccess(memberState.viewer, '/admin/videos').kind).toBe('ok')

    const schonherz = await createAuthSession(
      {
        memberSub: 'sub-admin-sch',
        username: 'adminsch',
        groups: [config.authentik.groups.schonherz],
        accessToken: null,
      },
      { db },
    )
    const schState = await resolveViewerStateFromRequest(
      requestWithCookie(schonherz.token),
      { db, config },
    )
    expect(adminAreaAccess(schState.viewer, '/admin/videos').kind).toBe(
      'forbidden',
    )
  })

  it('lejárt sessionnel névtelen nézőt kap → belépésre irányítás', async () => {
    const db = await setupDb()
    const expired = await createAuthSession(
      {
        memberSub: 'sub-expired',
        username: 'expired',
        groups: [config.authentik.groups.tag],
        accessToken: null,
      },
      { db, ttlMs: -1000 },
    )
    const state = await resolveViewerStateFromRequest(
      requestWithCookie(expired.token),
      { db, config },
    )
    expect(state.loggedIn).toBe(false)
    expect(adminAreaAccess(state.viewer, '/admin/videos').kind).toBe('login')
  })

  it('cookie nélkül névtelen; vezetőségi csoport tagsággal együtt ad teljes jogot', async () => {
    const db = await setupDb()
    const anonymousState = await resolveViewerStateFromRequest(
      new Request('http://localhost/admin'),
      { db, config },
    )
    expect(anonymousState.viewer.level).toBe('anonymous')

    // névtelen marad, így az admin terület belépést sem enged neki.
    const leadOnly = await createAuthSession(
      {
        memberSub: 'sub-lead-only',
        username: 'leadonly',
        groups: [config.authentik.groups.vezetoseg],
        accessToken: null,
      },
      { db },
    )
    const leadOnlyState = await resolveViewerStateFromRequest(
      requestWithCookie(leadOnly.token),
      { db, config },
    )
    expect(leadOnlyState.viewer.level).not.toBe('leadership')
    expect(leadOnlyState.viewer.level).not.toBe('member')
    expect(
      ['ok', 'forbidden'].includes(
        adminAreaAccess(leadOnlyState.viewer, '/admin').kind,
      ),
    ).toBe(false)

    const full = await createAuthSession(
      {
        memberSub: 'sub-full-lead',
        username: 'fulllead',
        groups: [
          config.authentik.groups.tag,
          config.authentik.groups.vezetoseg,
        ],
        accessToken: null,
      },
      { db },
    )
    const fullState = await resolveViewerStateFromRequest(
      requestWithCookie(full.token),
      { db, config },
    )
    expect(fullState.viewer.level).toBe('leadership')
    expect(leadershipAreaAccess(fullState.viewer).kind).toBe('ok')
  })
})
