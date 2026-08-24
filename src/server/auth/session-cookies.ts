import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import type { OobConfig } from '#/server/config/oob-schema.ts'

export const SESSION_COOKIE_NAME = 'bss_session'
export const OIDC_TXN_COOKIE_NAME = 'bss_oidc_txn'

/** Role changes take effect within at most an hour: absolute session TTL. */
export const SESSION_TTL_MS = 60 * 60 * 1000
/** The login transaction (state/PKCE/returnTo) lives in a short-lived cookie. */
export const OIDC_TXN_TTL_SECONDS = 600

export interface CookieSpec {
  name: string
  value: string
  maxAgeSeconds?: number
  secure?: boolean
}

export function serializeSetCookie(spec: CookieSpec): string {
  const parts = [
    `${spec.name}=${spec.value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (spec.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(spec.maxAgeSeconds)}`)
  }
  if (spec.secure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

function parseCookies(header: string): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) {
      continue
    }
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name !== '') {
      cookies.set(name, decodeURIComponent(value))
    }
  }
  return cookies
}

export function readCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) {
    return null
  }
  return parseCookies(header).get(name) ?? null
}

export function expiredCookieHeader(name: string, secure = false): string {
  return serializeSetCookie({ name, value: '', maxAgeSeconds: 0, secure })
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function txnSigningKey(config: OobConfig['authentik']): Buffer {
  return createHash('sha256')
    .update(`bss-oidc-txn:${config.clientId}:${config.clientSecret}`)
    .digest()
}

export interface SignedTxnPayload {
  value: string
  signatureHex: string
}

export function signOidcTxn(
  jsonPayload: string,
  config: OobConfig['authentik'],
): string {
  const signature = createHmac('sha256', txnSigningKey(config))
    .update(jsonPayload)
    .digest('hex')
  return `${Buffer.from(jsonPayload, 'utf-8').toString('base64url')}.${signature}`
}

export function verifyAndReadOidcTxn(
  cookieValue: string,
  config: OobConfig['authentik'],
): string | null {
  const separator = cookieValue.lastIndexOf('.')
  if (separator === -1) {
    return null
  }
  const encoded = cookieValue.slice(0, separator)
  const signatureHex = cookieValue.slice(separator + 1)

  const expected = createHmac('sha256', txnSigningKey(config))
    .update(Buffer.from(encoded, 'base64url'))
    .digest()

  const provided = Buffer.from(signatureHex, 'hex')
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null
  }

  try {
    return Buffer.from(encoded, 'base64url').toString('utf-8')
  } catch {
    return null
  }
}
