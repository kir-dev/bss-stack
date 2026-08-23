import { describe, expect, it } from 'vitest'
import { FakeClock } from '#/lib/clock.ts'
import {
  buildAuthorizationUrl,
  clearDiscoveryCache,
  decodeJwtPayload,
  exchangeCodeForTokens,
  extractIdentityFromClaims,
  fetchDiscovery,
  OidcProtocolError,
  OidcUnavailableError,
  pkceChallenge,
  safeEquals,
  validateIdTokenClaims,
} from '#/server/auth/oidc.ts'
import type { LoginTransactionData } from '#/server/auth/oidc.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'

const config = validateOobConfig(buildRawOobConfig())

const discovery = {
  issuer: config.authentik.issuerUrl.replace(/\/$/, ''),
  authorization_endpoint: `${config.authentik.issuerUrl}/authorize`,
  token_endpoint: `${config.authentik.issuerUrl}/token/`,
}

const parsedDiscovery = {
  issuer: discovery.issuer,
  authorizationEndpoint: discovery.authorization_endpoint,
  tokenEndpoint: discovery.token_endpoint,
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url')
}

function makeIdToken(claims: Record<string, unknown>): string {
  const header = base64urlJson({ alg: 'RS256', typ: 'JWT' })
  return `${header}.${base64urlJson(claims)}.alairasresz`
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('PKCE', () => {
  it('az S256 challenge a verifier SHA-256 base64url alakja', () => {
    // RFC 7636 appendix B vektor
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('discovery lekérdezés', () => {
  it('a well-known végpontról tölti be és validálja a dokumentumot', async () => {
    clearDiscoveryCache()
    let requestedUrl = ''
    const fetchMock = (async (url: RequestInfo | URL) => {
      requestedUrl = String(url)
      return jsonResponse(200, discovery)
    }) as typeof fetch

    const result = await fetchDiscovery(config.authentik, {
      fetchImpl: fetchMock,
    })

    expect(requestedUrl).toBe(
      `${discovery.issuer}/.well-known/openid-configuration`,
    )
    expect(result.authorizationEndpoint).toBe(discovery.authorization_endpoint)
    expect(result.tokenEndpoint).toBe(discovery.token_endpoint)
  })

  it('azonos issuerhez cache-ből szolgálja ki, az óra szerint lejárva újratölt', async () => {
    clearDiscoveryCache()
    let callCount = 0
    const fetchMock = (async () => {
      callCount += 1
      return jsonResponse(200, discovery)
    }) as typeof fetch
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')

    await fetchDiscovery(config.authentik, { fetchImpl: fetchMock, clock })
    await fetchDiscovery(config.authentik, { fetchImpl: fetchMock, clock })
    expect(callCount).toBe(1)

    clock.advanceHours(2)
    await fetchDiscovery(config.authentik, { fetchImpl: fetchMock, clock })
    expect(callCount).toBe(2)
    clearDiscoveryCache()
  })

  it('eltérő issuer esetén protokollhibát dob', async () => {
    clearDiscoveryCache()
    const fetchMock = (async () =>
      jsonResponse(200, {
        ...discovery,
        issuer: 'https://rossz.example.com/application/o/mas/',
      })) as typeof fetch

    await expect(
      fetchDiscovery(config.authentik, { fetchImpl: fetchMock }),
    ).rejects.toThrow(OidcProtocolError)
    clearDiscoveryCache()
  })

  it('hiányzó token endpoint esetén protokollhibát dob', async () => {
    clearDiscoveryCache()
    const fetchMock = (async () =>
      jsonResponse(200, {
        issuer: discovery.issuer,
        authorization_endpoint: discovery.authorization_endpoint,
      })) as typeof fetch

    await expect(
      fetchDiscovery(config.authentik, { fetchImpl: fetchMock }),
    ).rejects.toThrow(/token_endpoint/)
    clearDiscoveryCache()
  })

  it('nem elérhető Authentik esetén magyar hibával jelzi a kiesést', async () => {
    clearDiscoveryCache()
    const fetchMock = (async () => {
      throw new Error('connection refused')
    }) as typeof fetch

    try {
      await fetchDiscovery(config.authentik, { fetchImpl: fetchMock })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(OidcUnavailableError)
      expect((error as Error).message).toContain('Authentik nem elérhető')
    }
    clearDiscoveryCache()
  })
})

describe('authorization URL', () => {
  it('tartalmazza az OIDC Authorization Code + PKCE paramétereket', () => {
    const transaction: Pick<
      LoginTransactionData,
      'state' | 'codeVerifier' | 'nonce'
    > = {
      state: 'allapot-123',
      codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      nonce: 'nonce-123',
    }

    const url = new URL(
      buildAuthorizationUrl(
        parsedDiscovery,
        config.authentik,
        'http://127.0.0.1:3000/api/auth/callback',
        transaction,
      ),
    )

    expect(
      url.toString().startsWith(parsedDiscovery.authorizationEndpoint),
    ).toBe(true)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(config.authentik.clientId)
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:3000/api/auth/callback',
    )
    expect(url.searchParams.get('scope')).toBe(
      config.authentik.scopes.join(' '),
    )
    expect(url.searchParams.get('state')).toBe('allapot-123')
    expect(url.searchParams.get('nonce')).toBe('nonce-123')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(
      pkceChallenge(transaction.codeVerifier),
    )
  })
})

describe('token csere', () => {
  it('a form törzsben küldi a titkot és a code_verifiert, soha nem URL-ben', async () => {
    let capturedBody = ''
    let capturedAuthorizationHeader: string | null = null
    const fetchMock = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '')
      capturedAuthorizationHeader = new Headers(init?.headers).get(
        'authorization',
      )
      return jsonResponse(200, { access_token: 'at', id_token: 'it' })
    }) as typeof fetch

    await exchangeCodeForTokens(
      parsedDiscovery,
      config.authentik,
      'http://127.0.0.1:3000/api/auth/callback',
      'kod-123',
      'verifier-123',
      { fetchImpl: fetchMock },
    )

    const params = new URLSearchParams(capturedBody)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('kod-123')
    expect(params.get('code_verifier')).toBe('verifier-123')
    expect(params.get('client_id')).toBe(config.authentik.clientId)
    expect(params.get('client_secret')).toBe(config.authentik.clientSecret)
    expect(capturedAuthorizationHeader).toBeNull()
  })

  it('hibás válasz esetén elérhetetlenségi hibát dob', async () => {
    const fetchMock = (async () =>
      jsonResponse(400, { error: 'invalid_grant' })) as typeof fetch

    await expect(
      exchangeCodeForTokens(
        parsedDiscovery,
        config.authentik,
        'http://x/callback',
        'kod',
        'verifier',
        { fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(OidcUnavailableError)
  })

  it('id_token nélküli válasz esetén protokolli hibát dob', async () => {
    const fetchMock = (async () =>
      jsonResponse(200, { access_token: 'at' })) as typeof fetch

    await expect(
      exchangeCodeForTokens(
        parsedDiscovery,
        config.authentik,
        'http://x/callback',
        'kod',
        'verifier',
        { fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/id_token/)
  })
})

describe('id_token validáció', () => {
  const baseClaims = (nowSeconds: number) => ({
    iss: discovery.issuer,
    aud: config.authentik.clientId,
    exp: nowSeconds + 300,
    nonce: 'n',
    sub: 'sub-1',
  })

  it('érvényes claimset elfogad', () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    validateIdTokenClaims(baseClaims(clock.now().getTime() / 1000), {
      issuer: discovery.issuer,
      clientId: config.authentik.clientId,
      nonce: 'n',
      clock,
    })
  })

  it('aud lista egyik elemének egyeznie kell', () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    const claims = {
      ...baseClaims(clock.now().getTime() / 1000),
      aud: ['masik', config.authentik.clientId],
    }
    validateIdTokenClaims(claims, {
      issuer: discovery.issuer,
      clientId: config.authentik.clientId,
      nonce: 'n',
      clock,
    })
  })

  it('eltérő issuer, audience, nonce és lejárat esetén hibát dob', () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    const nowSeconds = clock.now().getTime() / 1000
    const expected = {
      issuer: discovery.issuer,
      clientId: config.authentik.clientId,
      nonce: 'n',
      clock,
    }

    expect(() =>
      validateIdTokenClaims(
        { ...baseClaims(nowSeconds), iss: 'https://mas' },
        expected,
      ),
    ).toThrow(/issuer/)
    expect(() =>
      validateIdTokenClaims(
        { ...baseClaims(nowSeconds), aud: 'mas' },
        expected,
      ),
    ).toThrow(/audience/)
    expect(() =>
      validateIdTokenClaims(
        { ...baseClaims(nowSeconds), nonce: 'mas' },
        expected,
      ),
    ).toThrow(/nonce/)
    expect(() =>
      validateIdTokenClaims({ ...baseClaims(nowSeconds - 3600) }, expected),
    ).toThrow(/lejárt/)
    expect(() =>
      validateIdTokenClaims(
        { iss: discovery.issuer, aud: config.authentik.clientId },
        expected,
      ),
    ).toThrow(/exp/)
  })
})

describe('JWT payload dekódolás', () => {
  it('érvényes JWT payload-t visszaad', () => {
    const claims = decodeJwtPayload(makeIdToken({ sub: 'sub-1' }))
    expect(claims['sub']).toBe('sub-1')
  })

  it('rossz formátum esetén hibát dob', () => {
    expect(() => decodeJwtPayload('nem-jwt')).toThrow(OidcProtocolError)
  })
})

describe('identity kinyerés', () => {
  it('a config alapján képezi le a claimeket és szűri a csoportokat', () => {
    const identity = extractIdentityFromClaims(
      {
        sub: 'sub-1',
        preferred_username: 'tag-dev',
        name: 'Teszt BSS Tag',
        nickname: 'Tagocska',
        picture: null,
        groups: ['bss-tag', 'bss-vezetoseg', 42, ''],
      },
      config.authentik,
    )

    expect(identity.sub).toBe('sub-1')
    expect(identity.username).toBe('tag-dev')
    expect(identity.fullName).toBe('Teszt BSS Tag')
    expect(identity.nickname).toBe('Tagocska')
    expect(identity.avatarUrl).toBeNull()
    expect(identity.groups).toEqual(['bss-tag', 'bss-vezetoseg'])
  })

  it('hiányzó sub vagy felhasználónév esetén nem talál ki identitást', () => {
    expect(() => extractIdentityFromClaims({}, config.authentik)).toThrow(/sub/)
    expect(() =>
      extractIdentityFromClaims({ sub: 'sub-1' }, config.authentik),
    ).toThrow(/felhasználónév/)
  })
})

describe('safeEquals', () => {
  it('csak pontosan egyező szövegeket tart egyezőnek', () => {
    expect(safeEquals('abc', 'abc')).toBe(true)
    expect(safeEquals('abc', 'abd')).toBe(false)
    expect(safeEquals('abc', 'abcd')).toBe(false)
    expect(safeEquals('', '')).toBe(true)
  })
})
