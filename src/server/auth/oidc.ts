import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { systemClock } from '#/lib/clock.ts'
import type { Clock } from '#/lib/clock.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'

export const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000
export const DISCOVERY_TIMEOUT_MS = 5_000
export const TOKEN_TIMEOUT_MS = 10_000
const CLOCK_SKEW_MS = 30_000

export class OidcUnavailableError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'OidcUnavailableError'
  }
}

export class OidcProtocolError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'OidcProtocolError'
  }
}

export interface OidcDiscovery {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
}

export interface LoginTransactionData {
  state: string
  codeVerifier: string
  nonce: string
  returnTo: string
  createdAtIso: string
}

export interface TokenSet {
  accessToken: string
  idToken: string
}

export interface AuthenticatedIdentity {
  sub: string
  username: string
  groups: string[]
}

interface DiscoveryCacheEntry {
  discovery: OidcDiscovery
  fetchedAt: number
}

const discoveryCache = new Map<string, DiscoveryCacheEntry>()

export function clearDiscoveryCache(): void {
  discoveryCache.clear()
}

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

export function randomToken(byteLength = 32): string {
  return base64url(randomBytes(byteLength))
}

export function pkceChallenge(codeVerifier: string): string {
  return base64url(createHash('sha256').update(codeVerifier).digest())
}

export function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }
  return timingSafeEqual(leftBuffer, rightBuffer)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchDiscovery(
  authentik: OobConfig['authentik'],
  options: { fetchImpl?: typeof fetch; clock?: Clock } = {},
): Promise<OidcDiscovery> {
  const fetchImpl = options.fetchImpl ?? fetch
  const clock = options.clock ?? systemClock
  const cacheKey = `${authentik.clientId}@${authentik.issuerUrl}`
  const cached = discoveryCache.get(cacheKey)
  const now = clock.now().getTime()

  if (
    cached &&
    now - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS &&
    cached.discovery.authorizationEndpoint &&
    cached.discovery.tokenEndpoint
  ) {
    return cached.discovery
  }

  const wellKnownUrl = new URL(
    '.well-known/openid-configuration',
    authentik.issuerUrl.endsWith('/')
      ? authentik.issuerUrl
      : `${authentik.issuerUrl}/`,
  )

  let response: Response
  try {
    response = await fetchWithTimeout(
      wellKnownUrl.toString(),
      { method: 'GET', headers: { accept: 'application/json' } },
      DISCOVERY_TIMEOUT_MS,
      fetchImpl,
    )
  } catch (error) {
    throw new OidcUnavailableError(
      `Az Authentik nem elérhető a discovery lekérdezéshez: ${wellKnownUrl.toString()}`,
      error,
    )
  }

  if (!response.ok) {
    throw new OidcUnavailableError(
      `Az Authentik discovery válasza hibás: HTTP ${response.status}`,
    )
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    throw new OidcUnavailableError(
      'Az Authentik discovery válasza nem érvényes JSON.',
      error,
    )
  }

  const discovery = parseDiscovery(raw)
  if (
    normalizeIssuer(discovery.issuer) !== normalizeIssuer(authentik.issuerUrl)
  ) {
    throw new OidcProtocolError(
      `Az Authentik discovery issuer-e eltér a beállítótól: ${discovery.issuer}`,
    )
  }

  discoveryCache.set(cacheKey, { discovery, fetchedAt: now })
  return discovery
}

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function parseDiscovery(raw: unknown): OidcDiscovery {
  if (typeof raw !== 'object' || raw === null) {
    throw new OidcProtocolError('A discovery dokumentum nem objektum.')
  }
  const record = raw as Record<string, unknown>
  for (const key of ['issuer', 'authorization_endpoint', 'token_endpoint']) {
    if (typeof record[key] !== 'string' || record[key].trim() === '') {
      throw new OidcProtocolError(
        `A discovery dokumentumban hiányzik a(z) "${key}" mező.`,
      )
    }
  }
  return {
    issuer: record['issuer'] as string,
    authorizationEndpoint: record['authorization_endpoint'] as string,
    tokenEndpoint: record['token_endpoint'] as string,
  }
}

export function buildLoginTransaction(returnTo: string): LoginTransactionData {
  return {
    state: randomToken(),
    codeVerifier: randomToken(),
    nonce: randomToken(),
    returnTo,
    createdAtIso: new Date().toISOString(),
  }
}

export function buildAuthorizationUrl(
  discovery: OidcDiscovery,
  config: OobConfig['authentik'],
  redirectUri: string,
  transaction: Pick<LoginTransactionData, 'state' | 'codeVerifier' | 'nonce'>,
): string {
  const url = new URL(discovery.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', transaction.state)
  url.searchParams.set('nonce', transaction.nonce)
  url.searchParams.set(
    'code_challenge',
    pkceChallenge(transaction.codeVerifier),
  )
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeCodeForTokens(
  discovery: OidcDiscovery,
  config: OobConfig['authentik'],
  redirectUri: string,
  code: string,
  codeVerifier: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<TokenSet> {
  const fetchImpl = options.fetchImpl ?? fetch

  let response: Response
  try {
    response = await fetchWithTimeout(
      discovery.tokenEndpoint,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code_verifier: codeVerifier,
        }),
      },
      TOKEN_TIMEOUT_MS,
      fetchImpl,
    )
  } catch (error) {
    throw new OidcUnavailableError(
      'A token csere nem sikerült, az Authentik nem elérhető.',
      error,
    )
  }

  if (!response.ok) {
    throw new OidcUnavailableError(
      `A token csere hibás választ adott: HTTP ${response.status}`,
    )
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    throw new OidcProtocolError('A token válasz nem érvényes JSON.', error)
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new OidcProtocolError('A token válasz nem objektum.')
  }
  const record = raw as Record<string, unknown>
  const accessToken = record['access_token']
  const idToken = record['id_token']
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new OidcProtocolError('A token válaszban hiányzik az access_token.')
  }
  if (typeof idToken !== 'string' || idToken === '') {
    throw new OidcProtocolError('A token válaszban hiányzik az id_token.')
  }
  return { accessToken, idToken }
}

export function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new OidcProtocolError('Az id_token nem három részes JWT.')
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf-8')
    const payload: unknown = JSON.parse(json)
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new Error('a payload nem objektum')
    }
    return payload as Record<string, unknown>
  } catch (error) {
    throw new OidcProtocolError('Az id_token payload nem értelmezhető.', error)
  }
}

export function validateIdTokenClaims(
  claims: Record<string, unknown>,
  expected: {
    issuer: string
    clientId: string
    nonce: string
    clock?: Clock
  },
): void {
  const clock = expected.clock ?? systemClock

  if (claims['iss'] !== expected.issuer) {
    throw new OidcProtocolError('Az id_token issuer-e nem egyezik.')
  }

  const aud = claims['aud']
  const audMatches =
    aud === expected.clientId ||
    (Array.isArray(aud) && (aud as unknown[]).includes(expected.clientId))
  if (!audMatches) {
    throw new OidcProtocolError('Az id_token audience-e nem egyezik.')
  }

  const exp = claims['exp']
  if (typeof exp !== 'number') {
    throw new OidcProtocolError('Az id_tokenben hiányzik az exp.')
  }
  if ((exp + CLOCK_SKEW_MS / 1000) * 1000 < clock.now().getTime()) {
    throw new OidcProtocolError('Az id_token lejárt.')
  }

  if (claims['nonce'] !== expected.nonce) {
    throw new OidcProtocolError('Az id_token nonce-a nem egyezik.')
  }
}

function claimString(
  claims: Record<string, unknown>,
  claimName: string,
): string | null {
  const value = claims[claimName]
  if (typeof value === 'string' && value.trim() !== '') {
    return value
  }
  return null
}

export function extractIdentityFromClaims(
  claims: Record<string, unknown>,
  config: OobConfig['authentik'],
): AuthenticatedIdentity {
  const sub = claimString(claims, config.claims.sub)
  if (!sub) {
    throw new OidcProtocolError(
      `Az id_tokenben hiányzik a kötelező "${config.claims.sub}" (sub) claim.`,
    )
  }
  const username = claimString(claims, 'preferred_username') ?? sub

  const rawGroups = claims['groups']
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter(
        (group): group is string =>
          typeof group === 'string' && group.trim() !== '',
      )
    : []

  return {
    sub,
    username,
    groups,
  }
}
