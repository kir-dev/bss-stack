export const MEMBERSHIP_STATUS_KEYS = [
  'MEMBER_CANDIDATE_CANDIDATE',
  'MEMBER_CANDIDATE',
  'MEMBER',
  'ACTIVE_ALUMNI',
  'ALUMNI',
] as const

export const DEFAULT_SEED_PATH = 'oob/seed.json'

export type MembershipStatusKey = (typeof MEMBERSHIP_STATUS_KEYS)[number]

export type SemesterKey = 'spring' | 'autumn'

export interface OidcClientConfig {
  issuerUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
}

export interface OobConfig {
  authentik: OidcClientConfig & {
    claims: {
      sub: string
    }
    groups: {
      admin: string
      studio: string
      studioCandidate: string
      studioCandidateCandidate: string
      leadership: string
      alumni: string
    }
  }
  /**
   * AuthSCH (auth.sch.bme.hu) login for Schönherz viewers. Optional: without
   * it only the Authentik login exists.
   */
  authsch: OidcClientConfig | null
  youtube: {
    oEmbedEndpoint: string
  }
  media: {
    host: string
    allowedHosts: string[]
  }
  /**
   * Seed JSON for `pnpm db:seed`; the server never reads it. Optional:
   * without it the path is DEFAULT_SEED_PATH.
   */
  seed: {
    path: string
  }
}

export class OobConfigError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(
      `A BSS OOB config érvénytelen vagy hiányzó elemeket tartalmaz (${problems.length} probléma):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        '\nLásd: docs/oob-inputs.md',
    )
    this.name = 'OobConfigError'
    this.problems = problems
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  source: Record<string, unknown>,
  path: string,
  problems: string[],
): void {
  const value = source[path.split('.').pop()!]
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${path}: kötelező szövegmező, hiányzik vagy üres.`)
  }
}

function isPrivateHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:') return false
    return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      parsed.hostname,
    )
  } catch {
    return false
  }
}

function validateOidcClient(
  section: Record<string, unknown>,
  prefix: string,
  problems: string[],
): void {
  requireString(section, `${prefix}.issuerUrl`, problems)
  requireString(section, `${prefix}.clientId`, problems)
  requireString(section, `${prefix}.clientSecret`, problems)

  const issuerUrlValue = section['issuerUrl']
  if (
    typeof issuerUrlValue === 'string' &&
    issuerUrlValue.trim() !== '' &&
    !issuerUrlValue.startsWith('https://') &&
    !issuerUrlValue.startsWith('http://localhost') &&
    !isPrivateHttpUrl(issuerUrlValue)
  ) {
    problems.push(
      `${prefix}.issuerUrl: https:// kezdetű URL vagy lokális http cím kell legyen.`,
    )
  }

  if (!Array.isArray(section['scopes']) || section['scopes'].length === 0) {
    problems.push(
      `${prefix}.scopes: kötelező nem üres lista (pl. openid, profile).`,
    )
  } else if (!section['scopes'].includes('openid')) {
    problems.push(`${prefix}.scopes: az openid scope kötelező.`)
  }
}

function readOidcClient(section: Record<string, unknown>): OidcClientConfig {
  return {
    issuerUrl: section['issuerUrl'] as string,
    clientId: section['clientId'] as string,
    clientSecret: section['clientSecret'] as string,
    scopes: section['scopes'] as string[],
  }
}

export function validateOobConfig(raw: unknown): OobConfig {
  const problems: string[] = []

  if (!isRecord(raw)) {
    throw new OobConfigError(['A config gyökere objektum kell legyen (JSON).'])
  }

  if (!isRecord(raw.authentik)) {
    problems.push('authentik: kötelező szekció hiányzik.')
  }
  if (!isRecord(raw.youtube)) {
    problems.push('youtube: kötelező szekció hiányzik.')
  }
  if (!isRecord(raw.media)) {
    problems.push('media: kötelező szekció hiányzik.')
  }

  if (problems.length > 0) {
    throw new OobConfigError(problems)
  }

  const authentik = raw.authentik as Record<string, unknown>
  const youtube = raw.youtube as Record<string, unknown>
  const media = raw.media as Record<string, unknown>

  validateOidcClient(authentik, 'authentik', problems)

  if (!isRecord(authentik['claims'])) {
    problems.push('authentik.claims: kötelező szekció hiányzik.')
  } else {
    const claims = authentik['claims']
    requireString(claims, 'authentik.claims.sub', problems)
  }

  if (!isRecord(authentik['groups'])) {
    problems.push('authentik.groups: kötelező szekció hiányzik.')
  } else {
    const groups = authentik['groups']
    for (const key of [
      'admin',
      'studio',
      'studioCandidate',
      'studioCandidateCandidate',
      'leadership',
      'alumni',
    ]) {
      requireString(groups, `authentik.groups.${key}`, problems)
    }
    const groupValues = Object.values(groups)
    if (new Set(groupValues).size !== groupValues.length) {
      problems.push('authentik.groups: minden csoportnévnek különböznie kell.')
    }
  }

  const authsch = raw.authsch
  if (authsch !== undefined && authsch !== null) {
    if (!isRecord(authsch)) {
      problems.push('authsch: objektum kell legyen (vagy hagyd el).')
    } else {
      validateOidcClient(authsch, 'authsch', problems)
    }
  }

  requireString(youtube, 'youtube.oEmbedEndpoint', problems)
  const oEmbedEndpoint = youtube['oEmbedEndpoint']
  if (typeof oEmbedEndpoint === 'string' && oEmbedEndpoint.trim() !== '') {
    try {
      const parsed = new URL(oEmbedEndpoint)
      if (!parsed.hostname.endsWith('youtube.com')) {
        problems.push(
          'youtube.oEmbedEndpoint: youtube.com alatti végpont kell legyen.',
        )
      }
    } catch {
      problems.push('youtube.oEmbedEndpoint: érvénytelen URL.')
    }
  }

  requireString(media, 'media.host', problems)
  const mediaHost = media['host']
  let mediaOrigin = ''
  let mediaHostname = ''
  if (typeof mediaHost === 'string' && mediaHost.trim() !== '') {
    try {
      const parsed = new URL(mediaHost)
      if (
        parsed.protocol !== 'https:' ||
        parsed.pathname !== '/' ||
        parsed.search !== '' ||
        parsed.hash !== ''
      ) {
        problems.push(
          'media.host: útvonal nélküli https origin kell legyen (pl. https://v.bsstudio.hu).',
        )
      } else {
        mediaOrigin = parsed.origin
        mediaHostname = parsed.hostname
      }
    } catch {
      problems.push('media.host: érvénytelen URL.')
    }
  }

  const seed = raw.seed
  if (seed !== undefined && seed !== null) {
    if (!isRecord(seed)) {
      problems.push('seed: objektum kell legyen (vagy hagyd el).')
    } else {
      requireString(seed, 'seed.path', problems)
    }
  }

  if (problems.length > 0) {
    throw new OobConfigError(problems)
  }

  const claims = authentik['claims'] as Record<string, unknown>
  const groups = authentik['groups'] as Record<string, unknown>

  return {
    authentik: {
      ...readOidcClient(authentik),
      claims: claims as unknown as OobConfig['authentik']['claims'],
      groups: groups as unknown as OobConfig['authentik']['groups'],
    },
    authsch: isRecord(authsch) ? readOidcClient(authsch) : null,
    youtube: {
      oEmbedEndpoint: youtube['oEmbedEndpoint'] as string,
    },
    media: {
      host: mediaOrigin,
      allowedHosts: [mediaHostname],
    },
    seed: {
      path: isRecord(seed) ? (seed['path'] as string) : DEFAULT_SEED_PATH,
    },
  }
}
