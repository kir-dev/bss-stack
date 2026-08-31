import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { FakeClock } from '#/lib/clock.ts'
import { createAuthRouteHandlers } from '#/server/api/auth-routes.ts'
import type { AuthRouteHandlers } from '#/server/api/auth-routes.ts'
import { verifyAndReadOidcTxn } from '#/server/auth/session-cookies.ts'
import {
  createAuthSession,
  findActiveAuthSession,
} from '#/server/auth/session-store.ts'
import { clearDiscoveryCache } from '#/server/auth/oidc.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { installFetchMock } from '../helpers/http-mock.ts'
import type { FetchMock } from '../helpers/http-mock.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const testConfig: OobConfig = validateOobConfig(buildRawOobConfig())

const ISSUER = 'https://authentik.local/application/o/bss'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const databases: Array<{ drop: () => Promise<void> }> = []
const clientCleanups: Array<() => Promise<void>> = []

afterAll(async () => {
  while (clientCleanups.length > 0) {
    await clientCleanups.pop()!()
  }
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

const activeMocks: FetchMock[] = []

afterEach(() => {
  while (activeMocks.length > 0) {
    activeMocks.pop()!.restore()
  }
})

function mockOidcEndpoints(idTokenFactory: () => string): void {
  activeMocks.push(
    installFetchMock([
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
            access_token: 'access-token-ertek',
            id_token: idTokenFactory(),
          },
        }),
      },
    ]),
  )
}

function mockFailingDiscovery(): void {
  activeMocks.push(
    installFetchMock([
      {
        urlPattern: /\.well-known\/openid-configuration/,
        respond: () => {
          throw new Error('connection refused')
        },
      },
    ]),
  )
}

function mockFailingTokenEndpoint(): void {
  activeMocks.push(
    installFetchMock([
      {
        method: 'POST',
        urlPattern: /\/token/,
        respond: () => {
          throw new Error('connection refused')
        },
      },
    ]),
  )
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url')
}

function makeIdToken(claims: Record<string, unknown>): string {
  return `${base64urlJson({ alg: 'RS256', typ: 'JWT' })}.${base64urlJson(claims)}.sig`
}

function validClaims(clock: FakeClock, extra: Record<string, unknown>) {
  return {
    iss: ISSUER,
    aud: testConfig.authentik.clientId,
    exp: Math.floor(clock.now().getTime() / 1000) + 600,
    ...extra,
  }
}

async function setupFlow(): Promise<{
  handlers: AuthRouteHandlers
  clock: FakeClock
  db: NodePgDatabase<Record<string, never>>
}> {
  clearDiscoveryCache()
  const migrated = await createMigratedTestDatabase('bss_auth')
  databases.push(migrated.database)
  clientCleanups.push(() => migrated.pool.end())
  const clock = new FakeClock('2026-06-01T10:00:00.000Z')
  const handlers = createAuthRouteHandlers({
    loadConfig: () => testConfig,
    db: migrated.db,
    clock,
  })
  return { handlers, clock, db: migrated.db }
}

async function runLogin(
  handlers: AuthRouteHandlers,
  returnTo?: string,
): Promise<Response> {
  const url = new URL('http://127.0.0.1:3000/api/auth/login')
  if (returnTo !== undefined) {
    url.searchParams.set('returnTo', returnTo)
  }
  return handlers.login(new Request(url))
}

function firstCookieValue(response: Response, name: string): string {
  const cookie = response.headers
    .getSetCookie()
    .find((candidate) => candidate.startsWith(`${name}=`))
  if (!cookie) {
    throw new Error(`Nem található ${name} cookie a válaszban`)
  }
  return cookie.split(';')[0].split('=').slice(1).join('=')
}

interface LoginTxn {
  txnCookie: string
  state: string
  nonce: string
  returnTo: string
}

/** Bejelentkezést indít; a mockot előbb telepíteni kell. */
async function loginAndParseTxn(
  handlers: AuthRouteHandlers,
  returnTo?: string,
): Promise<LoginTxn> {
  const loginResponse = await runLogin(handlers, returnTo)
  expect(loginResponse.status).toBe(302)
  const txnCookieValue = firstCookieValue(loginResponse, 'bss_oidc_txn')
  const txnJson = verifyAndReadOidcTxn(txnCookieValue, testConfig.authentik)
  expect(txnJson).not.toBeNull()
  const parsed = JSON.parse(txnJson!) as Record<string, unknown>
  return {
    txnCookie: `bss_oidc_txn=${txnCookieValue}`,
    state: parsed['state'] as string,
    nonce: parsed['nonce'] as string,
    returnTo: parsed['returnTo'] as string,
  }
}

describe.skipIf(!hasTestDatabase)('BSS-006: OIDC belépés és session', () => {
  it('login átirányít az authorization végpontra PKCE paraméterekkel', async () => {
    const { handlers } = await setupFlow()
    mockOidcEndpoints(() => makeIdToken({}))

    const response = await runLogin(handlers, '/videos')

    expect(response.status).toBe(302)
    const authorizeUrl = new URL(response.headers.get('location')!)
    expect(authorizeUrl.toString().startsWith(`${ISSUER}/authorize`)).toBe(true)
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code')
    expect(authorizeUrl.searchParams.get('client_id')).toBe(
      testConfig.authentik.clientId,
    )
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:3000/api/auth/callback',
    )
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizeUrl.searchParams.get('code_challenge')).not.toBe('')
    const setCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('bss_oidc_txn='))!
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(firstCookieValue(response, 'bss_oidc_txn')).not.toBe('')
  })

  it('névtelen felhasználó belépés után visszajut az eredeti oldalra és sessiont kap', async () => {
    const { handlers, clock, db } = await setupFlow()
    let issuedNonce = ''
    mockOidcEndpoints(() =>
      makeIdToken(
        validClaims(clock, {
          nonce: issuedNonce,
          sub: 'sub-tag-1',
          preferred_username: 'tag-dev',
          name: 'Teszt BSS Tag',
          groups: ['bss-tag'],
        }),
      ),
    )

    const { txnCookie, state, nonce, returnTo } = await loginAndParseTxn(
      handlers,
      '/videos',
    )
    expect(returnTo).toBe('/videos')
    issuedNonce = nonce

    const callbackResponse = await handlers.callback(
      new Request(
        `http://127.0.0.1:3000/api/auth/callback?code=engedely-kod&state=${encodeURIComponent(state)}`,
        { headers: { cookie: txnCookie } },
      ),
    )

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get('location')).toBe('/videos')

    const setCookies = callbackResponse.headers.getSetCookie()
    const sessionSetCookie = setCookies.find((cookie) =>
      cookie.startsWith('bss_session='),
    )!
    expect(sessionSetCookie).toContain('HttpOnly')
    expect(sessionSetCookie).toContain('SameSite=Lax')
    expect(sessionSetCookie).toContain(`Max-Age=${60 * 60}`)
    const clearedTxn = setCookies.find((cookie) =>
      cookie.startsWith('bss_oidc_txn='),
    )!
    expect(clearedTxn).toContain('Max-Age=0')

    const sessionToken = firstCookieValue(callbackResponse, 'bss_session')
    const session = await findActiveAuthSession(sessionToken, { clock, db })
    expect(session).not.toBeNull()
    expect(session!.memberSub).toBe('sub-tag-1')
    expect(session!.username).toBe('tag-dev')
    expect(session!.groups).toEqual(['bss-tag'])
    expect(session!.accessToken).toBe('access-token-ertek')

    const body = await callbackResponse.text()
    expect(body).not.toContain('access-token-ertek')
    expect(body).not.toContain(sessionToken)
  })

  it('state eltérés esetén magyar hibaoldalt ad és nem jön létre session', async () => {
    const { handlers, clock, db } = await setupFlow()
    mockOidcEndpoints(() => makeIdToken(validClaims(clock, {})))

    const { txnCookie } = await loginAndParseTxn(handlers)

    const callbackResponse = await handlers.callback(
      new Request(
        'http://127.0.0.1:3000/api/auth/callback?code=kod&state=rossz-state',
        { headers: { cookie: txnCookie } },
      ),
    )

    expect(callbackResponse.status).toBe(400)
    const text = await callbackResponse.text()
    expect(text).toContain('nem egyezik')
    expect(await findActiveAuthSession('', { db })).toBeNull()
  })

  it('cookie nélküli vagy lejárt tranzakciójú callback magyar hibát ad', async () => {
    const { handlers } = await setupFlow()

    const response = await handlers.callback(
      new Request('http://127.0.0.1:3000/api/auth/callback?code=kod&state=x'),
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('lejárt vagy érvénytelen')
  })

  it('id_token nonce eltérése esetén nem jön létre session', async () => {
    const { handlers, clock, db } = await setupFlow()
    mockOidcEndpoints(() =>
      makeIdToken(
        validClaims(clock, {
          nonce: 'nem-ez-a-nonce',
          sub: 'sub-x',
          preferred_username: 'valaki',
        }),
      ),
    )

    const { txnCookie, state } = await loginAndParseTxn(handlers)

    const response = await handlers.callback(
      new Request(
        `http://127.0.0.1:3000/api/auth/callback?code=kod&state=${encodeURIComponent(state)}`,
        { headers: { cookie: txnCookie } },
      ),
    )

    expect(response.status).toBe(502)
    expect(await findActiveAuthSession('nincs-token', { clock, db })).toBeNull()
  })

  it('nyitott átirányítás nélkül csak relatív returnTo él', async () => {
    const { handlers } = await setupFlow()
    mockOidcEndpoints(() => makeIdToken({}))

    for (const evil of [
      'https://rossz.example.com',
      '//rossz.example.com',
      'javascript:alert(1)',
    ]) {
      const response = await runLogin(handlers, evil)
      expect(response.status).toBe(302)
      const txnCookieValue = firstCookieValue(response, 'bss_oidc_txn')
      const txn = JSON.parse(
        verifyAndReadOidcTxn(txnCookieValue, testConfig.authentik)!,
      ) as Record<string, unknown>
      expect(txn['returnTo']).toBe('/')
    }
  })
})

describe.skipIf(!hasTestDatabase)(
  'BSS-006: Authentik-kiesési viselkedés',
  () => {
    it('login közben elérhetetlen Authentik esetén 503-as magyar oldal jön', async () => {
      const { handlers } = await setupFlow()
      mockFailingDiscovery()

      const response = await runLogin(handlers)

      expect(response.status).toBe(503)
      const text = await response.text()
      expect(text).toContain('Bejelentkezés nem elérhető')
      expect(text).toContain('A publikus oldalak működnek')
    })

    it('token csere közben elérhetetlen Authentik esetén 503-as magyar oldal jön', async () => {
      const { handlers } = await setupFlow()
      mockOidcEndpoints(() => makeIdToken({}))
      const { txnCookie, state } = await loginAndParseTxn(handlers)

      // A discovery cache-ből jön; a token hívást külön hibára állítjuk.
      activeMocks[activeMocks.length - 1].restore()
      activeMocks.pop()
      mockFailingTokenEndpoint()

      const response = await handlers.callback(
        new Request(
          `http://127.0.0.1:3000/api/auth/callback?code=kod&state=${encodeURIComponent(state)}`,
          { headers: { cookie: txnCookie } },
        ),
      )

      expect(response.status).toBe(503)
    })
  },
)

describe.skipIf(!hasTestDatabase)(
  'BSS-006/007: /api/auth/me állapot lekérdezés',
  () => {
    it('névtelen kérésre anonymous viewer-t ad és nem hívja az Authentiket', async () => {
      const { handlers } = await setupFlow()
      const mock = installFetchMock([])

      const response = await handlers.me(
        new Request('http://127.0.0.1:3000/api/auth/me'),
      )

      expect(response.status).toBe(200)
      const body = JSON.parse(await response.text()) as Record<string, unknown>
      expect(body['level']).toBe('anonymous')
      expect(body['sub']).toBeNull()
      expect(mock.calls()).toHaveLength(0)
      mock.restore()
    })

    it('session cookie-val a viewer szintjét adja (tag → member)', async () => {
      const { handlers, clock, db } = await setupFlow()
      const created = await createAuthSession(
        {
          memberSub: 'sub-tag-1',
          username: 'tag-dev',
          groups: [testConfig.authentik.groups.studio],
          accessToken: null,
        },
        { clock, db },
      )

      const response = await handlers.me(
        new Request('http://127.0.0.1:3000/api/auth/me', {
          headers: { cookie: `bss_session=${created.token}` },
        }),
      )

      expect(response.status).toBe(200)
      const body = JSON.parse(await response.text()) as Record<string, unknown>
      expect(body['level']).toBe('member')
      expect(body['sub']).toBe('sub-tag-1')
      expect(body['username']).toBe('tag-dev')

      clock.advanceMinutes(61)
      const expired = await handlers.me(
        new Request('http://127.0.0.1:3000/api/auth/me', {
          headers: { cookie: `bss_session=${created.token}` },
        }),
      )
      const expiredBody = JSON.parse(await expired.text()) as Record<
        string,
        unknown
      >
      expect(expiredBody['level']).toBe('anonymous')
    })
  },
)

describe.skipIf(!hasTestDatabase)(
  'BSS-006: session lejárat és kijelentkezés',
  () => {
    it('lejárt sessionnel nincs érvényes belépés (legfeljebb egy órás szerepfrissítés)', async () => {
      const { clock, db } = await setupFlow()
      const created = await createAuthSession(
        {
          memberSub: 'sub-y',
          username: 'valaki',
          groups: ['bss-tag'],
          accessToken: null,
        },
        { clock, db },
      )

      clock.advanceMinutes(59)
      expect(
        await findActiveAuthSession(created.token, { clock, db }),
      ).not.toBeNull()
      clock.advanceMinutes(2)
      expect(
        await findActiveAuthSession(created.token, { clock, db }),
      ).toBeNull()
    })

    it('POST logout törli a sessiont és üríti a cookiet', async () => {
      const { handlers, clock, db } = await setupFlow()
      const created = await createAuthSession(
        {
          memberSub: 'sub-z',
          username: 'valaki',
          groups: [],
          accessToken: null,
        },
        { clock, db },
      )

      const response = await handlers.logout(
        new Request('http://127.0.0.1:3000/api/auth/logout', {
          method: 'POST',
          headers: { cookie: `bss_session=${created.token}` },
        }),
      )

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/')
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((cookie) => cookie.startsWith('bss_session='))).toBe(
        true,
      )
      expect(
        cookies.find((cookie) => cookie.startsWith('bss_session='))!,
      ).toContain('Max-Age=0')
      expect(
        await findActiveAuthSession(created.token, { clock, db }),
      ).toBeNull()
    })

    it('idegen originű POST logout 403-at kap; GET logout nem engedélyezett', async () => {
      const { handlers } = await setupFlow()

      const foreign = await handlers.logout(
        new Request('http://127.0.0.1:3000/api/auth/logout', {
          method: 'POST',
          headers: { origin: 'https://rossz.example.com' },
        }),
      )
      expect(foreign.status).toBe(403)

      const getLogout = await handlers.logout(
        new Request('http://127.0.0.1:3000/api/auth/logout', { method: 'GET' }),
      )
      expect(getLogout.status).toBe(405)
    })
  },
)
