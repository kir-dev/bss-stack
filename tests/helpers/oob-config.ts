export interface RawSemesterRule {
  pattern: string
  semester: string
}

export interface RawOobConfig {
  authentik: {
    issuerUrl: string
    clientId: string
    clientSecret: string
    scopes: string[]
    sync: {
      username: string
      token: string
    }
    claims: Record<string, string>
    groups: Record<string, string>
    attributes: {
      membershipStatus: {
        attribute: string
        values: Record<string, string>
      }
      joinedSemester: {
        attribute: string
        rules: RawSemesterRule[]
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

export function buildRawOobConfig(
  overrides: DeepPartial<RawOobConfig> = {},
): RawOobConfig {
  const base: RawOobConfig = {
    authentik: {
      issuerUrl: 'https://authentik.local/application/o/bss/',
      clientId: 'bss-stack-local',
      clientSecret: 'local-test-secret-not-for-production',
      scopes: ['openid', 'profile', 'email'],
      sync: {
        username: 'svc-bss-sync',
        token: 'local-test-sync-token-not-for-production',
      },
      claims: {
        sub: 'sub',
        username: 'preferred_username',
        fullName: 'name',
        nickname: 'nickname',
        avatarUrl: 'picture',
      },
      groups: {
        schonherz: 'schonherz-dev',
        tag: 'tag-dev',
        vezetoseg: 'vezetoseg-dev',
      },
      attributes: {
        membershipStatus: {
          attribute: 'bss_status',
          values: {
            stúdiós: 'studio_member',
            stúdiósjelölt: 'studio_candidate',
            'stúdiósjelölt-jelölt': 'studio_applicant',
            'aktív öregtag': 'senior_active',
            'archivált öregtag': 'senior_archived',
            'dolgozott még velünk': 'contributor',
          },
        },
        joinedSemester: {
          attribute: 'bss_csatlakozas',
          rules: [
            { pattern: '^(\\d{4})\\s+(ősz|őszi)$', semester: 'autumn' },
            { pattern: '^(\\d{4})\\s+(tavasz|tavaszi)$', semester: 'spring' },
          ],
        },
        introduction: 'bss_bemutatkozas',
      },
    },
    media: {
      allowedHosts: ['v.bsstudio.hu'],
    },
    youtube: {
      oEmbedEndpoint: 'https://www.youtube.com/oEmbed',
    },
    seed: {
      path: 'oob/seed.json',
    },
  }

  return mergeDeep(base, overrides)
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends Array<infer I>
      ? Array<DeepPartial<I>>
      : DeepPartial<T[K]>
    : T[K]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeDeep<T>(target: T, patch: DeepPartial<T>): T {
  const result = target

  for (const key of Object.keys(patch)) {
    const patchValue = (patch as Record<string, unknown>)[key]
    const targetValue = (target as Record<string, unknown>)[key]

    if (isPlainObject(patchValue) && isPlainObject(targetValue)) {
      mergeDeep(targetValue, patchValue as never)
    } else {
      ;(result as Record<string, unknown>)[key] = patchValue
    }
  }

  return result
}
