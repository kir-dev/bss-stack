import {
  authFailurePage,
  authUnavailablePage,
  badRequestPage,
  forbiddenPage,
  getRequestOrigin,
  internalErrorPage,
  isSecureRequest,
  redirectResponse,
  sanitizeReturnTo,
  unauthorizedConfigPage,
} from '#/server/api/http.ts'
import {
  buildAuthorizationUrl,
  buildLoginTransaction,
  decodeJwtPayload,
  exchangeCodeForTokens,
  extractIdentityFromClaims,
  fetchDiscovery,
  OidcProtocolError,
  OidcUnavailableError,
  safeEquals,
  validateIdTokenClaims,
} from '#/server/auth/oidc.ts'
import type { LoginTransactionData, OidcDiscovery } from '#/server/auth/oidc.ts'
import {
  createAuthSession,
  deleteAuthSession,
  findActiveAuthSession,
} from '#/server/auth/session-store.ts'
import type { Database } from '#/server/auth/session-store.ts'
import {
  OIDC_TXN_COOKIE_NAME,
  OIDC_TXN_TTL_SECONDS,
  readCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  signOidcTxn,
  verifyAndReadOidcTxn,
} from '#/server/auth/session-cookies.ts'
import type { CookieSpec } from '#/server/auth/session-cookies.ts'
import type { Clock } from '#/lib/clock.ts'
import { getCachedOobConfig } from '#/server/config/load.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { viewerFromSession } from '#/server/auth/viewer.ts'

const TXN_MAX_AGE_MS = OIDC_TXN_TTL_SECONDS * 1000

export const CALLBACK_PATH = '/api/auth/callback'

export interface AuthRouteDeps {
  loadConfig?: () => OobConfig
  db?: Database
  clock?: Clock
}

export interface AuthRouteHandlers {
  login: (request: Request) => Promise<Response>
  callback: (request: Request) => Promise<Response>
  logout: (request: Request) => Promise<Response>
  me: (request: Request) => Promise<Response>
}

function logAuthFailure(context: string, error: unknown): void {
  console.error(`[auth] ${context}`, error)
}

function parseTxn(json: string): LoginTransactionData | null {
  try {
    const raw: unknown = JSON.parse(json)
    if (typeof raw !== 'object' || raw === null) {
      return null
    }
    const record = raw as Record<string, unknown>
    if (
      typeof record['state'] !== 'string' ||
      typeof record['codeVerifier'] !== 'string' ||
      typeof record['nonce'] !== 'string' ||
      typeof record['returnTo'] !== 'string' ||
      typeof record['createdAtIso'] !== 'string'
    ) {
      return null
    }
    return {
      state: record['state'],
      codeVerifier: record['codeVerifier'],
      nonce: record['nonce'],
      returnTo: sanitizeReturnTo(record['returnTo']),
      createdAtIso: record['createdAtIso'],
    }
  } catch {
    return null
  }
}

function txnIsFresh(txn: LoginTransactionData, nowMs: number): boolean {
  const createdAt = Date.parse(txn.createdAtIso)
  if (Number.isNaN(createdAt)) {
    return false
  }
  return nowMs - createdAt <= TXN_MAX_AGE_MS
}

function loadDepsConfig(
  deps: AuthRouteDeps,
): { config: OobConfig } | { errorResponse: Response } {
  try {
    return { config: (deps.loadConfig ?? getCachedOobConfigDefault)() }
  } catch (error) {
    logAuthFailure('OOB konfiguráció betöltése sikertelen', error)
    return { errorResponse: unauthorizedConfigPage() }
  }
}

function getCachedOobConfigDefault(): OobConfig {
  return getCachedOobConfig()
}

export function createAuthRouteHandlers(
  deps: AuthRouteDeps = {},
): AuthRouteHandlers {
  async function login(request: Request): Promise<Response> {
    const loaded = loadDepsConfig(deps)
    if ('errorResponse' in loaded) {
      return loaded.errorResponse
    }
    const config = loaded.config

    let discovery: OidcDiscovery
    try {
      discovery = await fetchDiscovery(config.authentik)
    } catch (error) {
      logAuthFailure('Az Authentik discovery nem elérhető', error)
      return authUnavailablePage()
    }

    const url = new URL(request.url)
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'))
    const transaction = buildLoginTransaction(returnTo)
    const redirectUri = `${getRequestOrigin(request)}${CALLBACK_PATH}`
    const authorizeUrl = buildAuthorizationUrl(
      discovery,
      config.authentik,
      redirectUri,
      transaction,
    )

    const txnCookie: CookieSpec = {
      name: OIDC_TXN_COOKIE_NAME,
      value: signOidcTxn(JSON.stringify(transaction), config.authentik),
      maxAgeSeconds: OIDC_TXN_TTL_SECONDS,
      secure: isSecureRequest(request),
    }

    return redirectResponse(authorizeUrl, [txnCookie])
  }

  async function callback(request: Request): Promise<Response> {
    const loaded = loadDepsConfig(deps)
    if ('errorResponse' in loaded) {
      return loaded.errorResponse
    }
    const config = loaded.config

    const url = new URL(request.url)
    const cookieValue = readCookieValue(request, OIDC_TXN_COOKIE_NAME)
    const txnJson =
      cookieValue === null
        ? null
        : verifyAndReadOidcTxn(cookieValue, config.authentik)

    if (txnJson === null) {
      return badRequestPage(
        'A bejelentkezési folyamat lejárt vagy érvénytelen. Indítsd el újra a belépést.',
      )
    }
    const transaction = parseTxn(txnJson)
    if (
      transaction === null ||
      !txnIsFresh(transaction, Date.now()) ||
      !safeEquals(url.searchParams.get('state') ?? '', transaction.state)
    ) {
      return badRequestPage(
        'A bejelentkezési folyamat állapota nem egyezik. Indítsd el újra a belépést.',
      )
    }

    if (url.searchParams.get('error') !== null) {
      return badRequestPage(
        'A bejelentkezés nem fejeződött be a bejelentkezési szolgáltatásnál. Próbáld újra.',
      )
    }
    const code = url.searchParams.get('code')
    if (code === null || code === '') {
      return badRequestPage(
        'Hiányzik a bejelentkezési kód. Próbáld újra a belépést.',
      )
    }

    try {
      const discovery = await fetchDiscovery(config.authentik)
      const redirectUri = `${getRequestOrigin(request)}${CALLBACK_PATH}`
      const tokens = await exchangeCodeForTokens(
        discovery,
        config.authentik,
        redirectUri,
        code,
        transaction.codeVerifier,
      )
      const claims = decodeJwtPayload(tokens.idToken)
      validateIdTokenClaims(claims, {
        issuer: discovery.issuer,
        clientId: config.authentik.clientId,
        nonce: transaction.nonce,
        clock: deps.clock,
      })
      const identity = extractIdentityFromClaims(claims, config.authentik)

      const created = await createAuthSession(
        {
          memberSub: identity.sub,
          username: identity.username,
          groups: identity.groups,
          accessToken: tokens.accessToken,
        },
        { db: deps.db, clock: deps.clock },
      )

      const secure = isSecureRequest(request)
      return redirectResponse(transaction.returnTo, [
        {
          name: SESSION_COOKIE_NAME,
          value: created.token,
          maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
          secure,
        },
        {
          name: OIDC_TXN_COOKIE_NAME,
          value: '',
          maxAgeSeconds: 0,
          secure,
        },
      ])
    } catch (error) {
      if (error instanceof OidcUnavailableError) {
        logAuthFailure(
          'Az Authentik nem elérhető a bejelentkezés közben',
          error,
        )
        return authUnavailablePage()
      }
      if (error instanceof OidcProtocolError) {
        logAuthFailure('Protokolli hiba a bejelentkezés közben', error)
        return authFailurePage(
          'A bejelentkezés során hiba történt a bejelentkezési szolgáltatással. Próbáld újra később.',
        )
      }
      logAuthFailure('Váratlan hiba a callback kezelésekor', error)
      return internalErrorPage(
        'Váratlan hiba történt a bejelentkezés során. Próbáld újra.',
      )
    }
  }

  async function logout(request: Request): Promise<Response> {
    if (request.method.toUpperCase() !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json', allow: 'POST' },
      })
    }
    const origin = request.headers.get('origin')
    if (
      origin !== null &&
      origin !== '' &&
      origin !== getRequestOrigin(request)
    ) {
      return forbiddenPage()
    }

    const token = readCookieValue(request, SESSION_COOKIE_NAME)
    const secure = isSecureRequest(request)
    if (token !== null && token !== '') {
      try {
        await deleteAuthSession(token, { db: deps.db })
      } catch (error) {
        logAuthFailure('A session törlése az adatbázisból nem sikerült', error)
      }
    }

    return redirectResponse('/', [
      { name: SESSION_COOKIE_NAME, value: '', maxAgeSeconds: 0, secure },
      { name: OIDC_TXN_COOKIE_NAME, value: '', maxAgeSeconds: 0, secure },
    ])
  }

  /**
   * Query the login state for the client. Reads only the local DB and never
   * calls Authentik (a public request must not depend on an external service).
   */
  async function me(request: Request): Promise<Response> {
    const token = readCookieValue(request, SESSION_COOKIE_NAME)
    const config = loadDepsConfig(deps)
    if ('errorResponse' in config) {
      return config.errorResponse
    }
    let session = null
    if (token !== null && token !== '') {
      try {
        session = await findActiveAuthSession(token, {
          db: deps.db,
          clock: deps.clock,
        })
      } catch (error) {
        logAuthFailure('A session lekérdezése nem sikerült', error)
        session = null
      }
    }
    const viewer = viewerFromSession(session, config.config.authentik)
    return new Response(JSON.stringify(viewer), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  return { login, callback, logout, me }
}
