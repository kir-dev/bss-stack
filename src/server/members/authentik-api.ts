import { TOKEN_TIMEOUT_MS } from '#/server/auth/oidc.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'

export interface AuthentikApiUser {
  pk: number
  username: string
  name: string
  isActive: boolean
  type: string
  avatarUrl: string | null
  attributes: Record<string, unknown>
  groups: string[]
}

export interface AuthentikApiGroup {
  pk: string
  name: string
}

export interface AuthentikApi {
  listUsers: () => Promise<AuthentikApiUser[]>
  listGroups: () => Promise<AuthentikApiGroup[]>
}

export class SyncUnavailableError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'SyncUnavailableError'
  }
}

function assertRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SyncUnavailableError(
      `Az Authentik API válasza érvénytelen (${context}).`,
    )
  }
  return value as Record<string, unknown>
}

async function fetchJson(
  url: string,
  init: RequestInit,
  context: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new SyncUnavailableError(
        `Az Authentik API ${context} hívása hibát adott: HTTP ${response.status}`,
      )
    }
    return await response.json()
  } catch (error) {
    if (error instanceof SyncUnavailableError) {
      throw error
    }
    throw new SyncUnavailableError(
      `Az Authentik API ${context} hívása nem sikerült (elérhetetlen szolgáltatás).`,
      error,
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Tagcache-szinkronhoz használt Authentik REST API kliens.
 * A hozzáférés a configban lévő szolgáltatási fiókkal (username + API token)
 * client_credentials granthasználatával történő bearer tokennel történik.
 */
export function createAuthentikApi(
  config: OobConfig['authentik'],
  options: {
    fetchImpl?: typeof fetch
    /** A discovery-ből származó token végpont; hiányában az issuer-ből képezzük. */
    tokenEndpoint?: string
  } = {},
): AuthentikApi {
  const fetchImpl = options.fetchImpl ?? fetch

  function resolveTokenEndpoint(): string {
    if (options.tokenEndpoint !== undefined && options.tokenEndpoint !== '') {
      return options.tokenEndpoint
    }
    const withoutIssuerPath = config.issuerUrl.replace(
      /application\/o\/[^/]+\/?$/,
      'application/o/',
    )
    return new URL('token/', withoutIssuerPath).toString()
  }

  async function getAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      username: config.sync.username,
      password: config.sync.token,
      scope: 'goauthentik.io/api',
    })
    const raw = await fetchJson(
      resolveTokenEndpoint(),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body,
      },
      'token szerzés',
      fetchImpl,
    )
    const record = assertRecord(raw, 'token válasz')
    const accessToken = record['access_token']
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new SyncUnavailableError(
        'Az Authentik token válaszban hiányzik az access_token.',
      )
    }
    return accessToken
  }

  async function listPaginated<T>(
    path: string,
    mapItem: (raw: Record<string, unknown>) => T,
  ): Promise<T[]> {
    const accessToken = await getAccessToken()
    const baseUrl = new URL(config.issuerUrl)
    const apiRoot = `${baseUrl.origin}/api/v3/`
    const items: T[] = []
    let page = 1
    let morePages = true

    while (morePages) {
      const url = new URL(path, apiRoot)
      url.searchParams.set('page', String(page))
      url.searchParams.set('page_size', '100')
      const raw = await fetchJson(
        url.toString(),
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
          },
        },
        path,
        fetchImpl,
      )
      const record = assertRecord(raw, path)
      const results = record['results']
      if (!Array.isArray(results)) {
        throw new SyncUnavailableError(
          `Az Authentik API ${path} válaszában hiányzik a results lista.`,
        )
      }
      for (const item of results) {
        items.push(mapItem(assertRecord(item, `${path} elem`)))
      }
      const next: unknown = record['pagination']
      const rawNext =
        typeof next === 'object' && next !== null
          ? (next as Record<string, unknown>)['next']
          : undefined
      const nextPage = typeof rawNext === 'number' ? rawNext : 0
      morePages = nextPage > page
      if (morePages) {
        page = nextPage
      }
    }

    return items
  }

  function mapUser(raw: Record<string, unknown>): AuthentikApiUser {
    const groups = Array.isArray(raw['groups'])
      ? raw['groups'].filter(
          (group): group is string => typeof group === 'string',
        )
      : []
    const attributes =
      typeof raw['attributes'] === 'object' && raw['attributes'] !== null
        ? (raw['attributes'] as Record<string, unknown>)
        : {}
    return {
      pk: Number(raw['pk']),
      username: String(raw['username'] ?? ''),
      name: String(raw['name'] ?? ''),
      isActive: raw['is_active'] === true,
      type: String(raw['type'] ?? ''),
      avatarUrl: typeof raw['avatar'] === 'string' ? raw['avatar'] : null,
      attributes,
      groups,
    }
  }

  return {
    async listUsers() {
      return listPaginated<AuthentikApiUser>(
        'core/users/?include_groups=true',
        mapUser,
      )
    },
    async listGroups() {
      return listPaginated<AuthentikApiGroup>('core/groups/', (raw) => ({
        pk: String(raw['pk'] ?? ''),
        name: String(raw['name'] ?? ''),
      }))
    },
  }
}
