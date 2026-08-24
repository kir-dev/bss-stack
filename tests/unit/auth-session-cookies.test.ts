import { describe, expect, it } from 'vitest'
import {
  expiredCookieHeader,
  hashSessionToken,
  newSessionToken,
  OIDC_TXN_COOKIE_NAME,
  readCookieValue,
  serializeSetCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  signOidcTxn,
  verifyAndReadOidcTxn,
} from '#/server/auth/session-cookies.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'

const config = validateOobConfig(buildRawOobConfig())

function requestWithCookies(cookieHeader: string): Request {
  return new Request('http://127.0.0.1:3000/', {
    headers: { cookie: cookieHeader },
  })
}

describe('Set-Cookie sorosítás', () => {
  it('a session cookie HTTP-only, SameSite=Lax és Path=/ attribútumú', () => {
    const header = serializeSetCookie({
      name: SESSION_COOKIE_NAME,
      value: 'token-123',
      maxAgeSeconds: SESSION_TTL_MS / 1000,
    })
    expect(header).toContain(`${SESSION_COOKIE_NAME}=token-123`)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`)
    expect(header).not.toContain('Secure')
  })

  it('secure kapcsolásnál Secure attribútumot tesz a cookie-ra', () => {
    const header = serializeSetCookie({
      name: SESSION_COOKIE_NAME,
      value: 't',
      secure: true,
    })
    expect(header.endsWith('; Secure')).toBe(true)
  })

  it('lejárt cookie törlésre szolgáló fejlécet készít', () => {
    expect(expiredCookieHeader(SESSION_COOKIE_NAME)).toBe(
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    )
  })
})

describe('cookie kiolvasás', () => {
  it('több cookie közül a kért nevűt adja vissza', () => {
    const request = requestWithCookies(
      `masik=ertek; ${OIDC_TXN_COOKIE_NAME}=txn-ertek; ${SESSION_COOKIE_NAME}=sess-123`,
    )
    expect(readCookieValue(request, OIDC_TXN_COOKIE_NAME)).toBe('txn-ertek')
    expect(readCookieValue(request, SESSION_COOKIE_NAME)).toBe('sess-123')
    expect(readCookieValue(request, 'nincsilyen')).toBeNull()
  })

  it('cookie fejléc nélkül nullát ad', () => {
    expect(
      readCookieValue(
        new Request('http://127.0.0.1:3000/'),
        SESSION_COOKIE_NAME,
      ),
    ).toBeNull()
  })
})

describe('session token hashelés', () => {
  it('sha256 hex formában, determinisztikusan hashel', () => {
    const token = newSessionToken()
    const first = hashSessionToken(token)
    const second = hashSessionToken(token)

    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).toBe(second)
    expect(hashSessionToken(newSessionToken())).not.toBe(first)
  })
})

describe('OIDC tranzakció cookie aláírás', () => {
  const payload = JSON.stringify({ state: 'abc' })

  it('aláírás után visszafejthető ugyanazzal a configgal', () => {
    const signed = signOidcTxn(payload, config.authentik)
    expect(verifyAndReadOidcTxn(signed, config.authentik)).toBe(payload)
  })

  it('módosított tartalom esetén nem érvényes', () => {
    const signed = signOidcTxn(payload, config.authentik)
    const tampered = `${Buffer.from(JSON.stringify({ state: 'rossz' }), 'utf-8').toString('base64url')}.${signed.split('.')[1]}`
    expect(verifyAndReadOidcTxn(tampered, config.authentik)).toBeNull()
  })

  it('eltérő titokkal aláírt cookie nem érvényes', () => {
    const otherConfig = validateOobConfig(
      buildRawOobConfig({ authentik: { clientSecret: 'masik-titok' } }),
    )
    const signed = signOidcTxn(payload, config.authentik)
    expect(verifyAndReadOidcTxn(signed, otherConfig.authentik)).toBeNull()
  })

  it('nem értelmezhető bemenetnél nullát ad', () => {
    expect(verifyAndReadOidcTxn('semmi-alairas', config.authentik)).toBeNull()
    expect(verifyAndReadOidcTxn('aaa.nem-hex', config.authentik)).toBeNull()
  })
})
