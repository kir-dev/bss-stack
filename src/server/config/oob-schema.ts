export const MEMBERSHIP_STATUS_KEYS = [
  'studio_member',
  'studio_candidate',
  'studio_applicant',
  'senior_active',
  'senior_archived',
  'contributor',
] as const

export type MembershipStatusKey = (typeof MEMBERSHIP_STATUS_KEYS)[number]

export type SemesterKey = 'spring' | 'autumn'

export interface OobConfig {
  authentik: {
    issuerUrl: string
    clientId: string
    clientSecret: string
    scopes: string[]
    claims: {
      sub: string
      username: string
      fullName: string
      nickname: string
      avatarUrl: string
    }
    groups: {
      schonherz: string
      tag: string
      vezetoseg: string
    }
  }
  youtube: {
    oEmbedEndpoint: string
  }
  media: {
    host: string
    allowedHosts: string[]
  }
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
  if (!isRecord(raw.seed)) {
    problems.push('seed: kötelező szekció hiányzik.')
  }

  if (problems.length > 0) {
    throw new OobConfigError(problems)
  }

  const authentik = raw.authentik as Record<string, unknown>
  const youtube = raw.youtube as Record<string, unknown>
  const media = raw.media as Record<string, unknown>
  const seed = raw.seed as Record<string, unknown>

  requireString(authentik, 'authentik.issuerUrl', problems)
  requireString(authentik, 'authentik.clientId', problems)
  requireString(authentik, 'authentik.clientSecret', problems)

  const issuerUrlValue = authentik['issuerUrl']
  const isPrivateHttpUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:') return false
      // RFC1918 private networks + loopback alternatives (e.g. dev runs on a LAN IP).
      return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        parsed.hostname,
      )
    } catch {
      return false
    }
  }
  if (
    typeof issuerUrlValue === 'string' &&
    issuerUrlValue.trim() !== '' &&
    !issuerUrlValue.startsWith('https://') &&
    !issuerUrlValue.startsWith('http://localhost') &&
    !isPrivateHttpUrl(issuerUrlValue)
  ) {
    problems.push(
      'authentik.issuerUrl: https:// kezdetű URL vagy lokális http cím kell legyen.',
    )
  }

  if (!Array.isArray(authentik['scopes']) || authentik['scopes'].length === 0) {
    problems.push(
      'authentik.scopes: kötelező nem üres lista (pl. openid, profile).',
    )
  } else if (!authentik['scopes'].includes('openid')) {
    problems.push('authentik.scopes: az openid scope kötelező.')
  }

  if (!isRecord(authentik['claims'])) {
    problems.push('authentik.claims: kötelező szekció hiányzik.')
  } else {
    const claims = authentik['claims']
    for (const key of [
      'sub',
      'username',
      'fullName',
      'nickname',
      'avatarUrl',
    ]) {
      requireString(claims, `authentik.claims.${key}`, problems)
    }
  }

  if (!isRecord(authentik['groups'])) {
    problems.push('authentik.groups: kötelező szekció hiányzik.')
  } else {
    const groups = authentik['groups']
    for (const key of ['schonherz', 'tag', 'vezetoseg']) {
      requireString(groups, `authentik.groups.${key}`, problems)
    }
    const groupValues = Object.values(groups)
    if (new Set(groupValues).size !== groupValues.length) {
      problems.push(
        'authentik.groups: minden csoportnévnek különböznie kell (a vezetőség tagságot nem helyettesítheti).',
      )
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

  requireString(seed, 'seed.path', problems)

  if (problems.length > 0) {
    throw new OobConfigError(problems)
  }

  const claims = authentik['claims'] as Record<string, unknown>
  const groups = authentik['groups'] as Record<string, unknown>

  return {
    authentik: {
      issuerUrl: authentik['issuerUrl'] as string,
      clientId: authentik['clientId'] as string,
      clientSecret: authentik['clientSecret'] as string,
      scopes: authentik['scopes'] as string[],
      claims: claims as unknown as OobConfig['authentik']['claims'],
      groups: groups as unknown as OobConfig['authentik']['groups'],
    },
    youtube: {
      oEmbedEndpoint: youtube['oEmbedEndpoint'] as string,
    },
    media: {
      host: mediaOrigin,
      allowedHosts: [mediaHostname],
    },
    seed: {
      path: seed['path'] as string,
    },
  }
}
