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
    /** Service account used for Tagcache sync (OOB secret). */
    sync: {
      username: string
      token: string
    }
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
    attributes: {
      membershipStatus: {
        attribute: string
        values: Record<string, MembershipStatusKey>
      }
      joinedSemester: {
        attribute: string
        rules: Array<{
          pattern: RegExp
          semester: SemesterKey
        }>
      }
      introduction: string
    }
  }
  media: {
    allowedHosts: string[]
  }
  youtube: {
    oEmbedEndpoint: string
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
  if (!isRecord(raw.media)) {
    problems.push('media: kötelező szekció hiányzik.')
  }
  if (!isRecord(raw.youtube)) {
    problems.push('youtube: kötelező szekció hiányzik.')
  }
  if (!isRecord(raw.seed)) {
    problems.push('seed: kötelező szekció hiányzik.')
  }

  if (problems.length > 0) {
    throw new OobConfigError(problems)
  }

  const authentik = raw.authentik as Record<string, unknown>
  const media = raw.media as Record<string, unknown>
  const youtube = raw.youtube as Record<string, unknown>
  const seed = raw.seed as Record<string, unknown>

  requireString(authentik, 'authentik.issuerUrl', problems)
  requireString(authentik, 'authentik.clientId', problems)
  requireString(authentik, 'authentik.clientSecret', problems)

  if (!isRecord(authentik['sync'])) {
    problems.push(
      'authentik.sync: kötelező szekció hiányzik (tagcache-szinkron szolgáltatási fiókja).',
    )
  } else {
    requireString(authentik.sync, 'authentik.sync.username', problems)
    requireString(authentik.sync, 'authentik.sync.token', problems)
  }

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

  if (!isRecord(authentik['attributes'])) {
    problems.push('authentik.attributes: kötelező szekció hiányzik.')
  } else {
    const attributes = authentik['attributes']

    if (!isRecord(attributes['membershipStatus'])) {
      problems.push(
        'authentik.attributes.membershipStatus: kötelező szekció hiányzik.',
      )
    } else {
      const status = attributes['membershipStatus']
      requireString(
        status,
        'authentik.attributes.membershipStatus.attribute',
        problems,
      )

      if (!isRecord(status['values'])) {
        problems.push(
          'authentik.attributes.membershipStatus.values: kötelező leképezés hiányzik.',
        )
      } else {
        const values = status['values']
        const entries = Object.entries(values)
        if (entries.length === 0) {
          problems.push(
            'authentik.attributes.membershipStatus.values: legalább egy nyers státusz leképezése kell.',
          )
        }
        for (const [rawStatus, mapped] of entries) {
          if (
            typeof mapped !== 'string' ||
            !MEMBERSHIP_STATUS_KEYS.includes(mapped as MembershipStatusKey)
          ) {
            problems.push(
              `authentik.attributes.membershipStatus.values["${rawStatus}"]: ismeretlen célállapot "${String(mapped)}". Engedélyezett: ${MEMBERSHIP_STATUS_KEYS.join(', ')}.`,
            )
          }
        }
      }
    }

    if (!isRecord(attributes['joinedSemester'])) {
      problems.push(
        'authentik.attributes.joinedSemester: kötelező szekció hiányzik.',
      )
    } else {
      const semester = attributes['joinedSemester']
      requireString(
        semester,
        'authentik.attributes.joinedSemester.attribute',
        problems,
      )

      if (!Array.isArray(semester['rules']) || semester['rules'].length === 0) {
        problems.push(
          'authentik.attributes.joinedSemester.rules: legalább egy értelmezési szabály kell.',
        )
      } else {
        ;(semester['rules'] as unknown[]).forEach((rule, index) => {
          const path = `authentik.attributes.joinedSemester.rules[${index}]`
          if (!isRecord(rule)) {
            problems.push(`${path}: objektum kell legyen (pattern, semester).`)
            return
          }
          if (
            typeof rule['pattern'] !== 'string' ||
            rule['pattern'].trim() === ''
          ) {
            problems.push(
              `${path}.pattern: reguláris kifejezés szövegként kötelező.`,
            )
          } else {
            try {
              const compiled = new RegExp(rule['pattern'])
              if (compiled.flags.includes('g')) {
                problems.push(`${path}.pattern: ne használj g flaget.`)
              }
            } catch {
              problems.push(`${path}.pattern: érvénytelen reguláris kifejezés.`)
            }
          }
          if (rule['semester'] !== 'spring' && rule['semester'] !== 'autumn') {
            problems.push(
              `${path}.semester: csak "spring" vagy "autumn" lehet, nem "${String(rule['semester'])}".`,
            )
          }
        })
      }
    }

    requireString(attributes, 'authentik.attributes.introduction', problems)
  }

  if (
    !Array.isArray(media['allowedHosts']) ||
    media['allowedHosts'].length === 0
  ) {
    problems.push(
      'media.allowedHosts: kötelező nem üres lista (specifikáció szerint v.bsstudio.hu).',
    )
  } else {
    for (const host of media['allowedHosts']) {
      if (typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host)) {
        problems.push(
          `media.allowedHosts: érvénytelen hostnév: "${String(host)}".`,
        )
      }
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

  requireString(seed, 'seed.path', problems)

  if (problems.length > 0) {
    throw new OobConfigError(problems)
  }

  const claims = authentik['claims'] as Record<string, unknown>
  const groups = authentik['groups'] as Record<string, unknown>
  const attributes = authentik['attributes'] as Record<string, unknown>
  const membershipStatus = attributes['membershipStatus'] as Record<
    string,
    unknown
  >
  const joinedSemester = attributes['joinedSemester'] as Record<string, unknown>

  return {
    authentik: {
      issuerUrl: authentik['issuerUrl'] as string,
      clientId: authentik['clientId'] as string,
      clientSecret: authentik['clientSecret'] as string,
      scopes: authentik['scopes'] as string[],
      sync: {
        username: (authentik['sync'] as Record<string, unknown>)[
          'username'
        ] as string,
        token: (authentik['sync'] as Record<string, unknown>)[
          'token'
        ] as string,
      },
      claims: claims as unknown as OobConfig['authentik']['claims'],
      groups: groups as unknown as OobConfig['authentik']['groups'],
      attributes: {
        membershipStatus: {
          attribute: membershipStatus['attribute'] as string,
          values: membershipStatus['values'] as Record<
            string,
            MembershipStatusKey
          >,
        },
        joinedSemester: {
          attribute: joinedSemester['attribute'] as string,
          rules: (
            joinedSemester['rules'] as Array<{
              pattern: string
              semester: SemesterKey
            }>
          ).map((rule) => ({
            pattern: new RegExp(rule.pattern),
            semester: rule.semester,
          })),
        },
        introduction: attributes['introduction'] as string,
      },
    },
    media: {
      allowedHosts: media['allowedHosts'] as string[],
    },
    youtube: {
      oEmbedEndpoint: youtube['oEmbedEndpoint'] as string,
    },
    seed: {
      path: seed['path'] as string,
    },
  }
}
