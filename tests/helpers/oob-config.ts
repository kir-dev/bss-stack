export interface RawOobConfig {
  authentik: {
    issuerUrl: string
    clientId: string
    clientSecret: string
    scopes: string[]
    claims: Record<string, string>
    groups: Record<string, string>
  }
  youtube: {
    oEmbedEndpoint: string
  }
  media: {
    host: string
  }
  seed: {
    path: string
  }
}

export const TEST_MEDIA_HOST = 'https://v.bsstudio.hu'
export const TEST_MEDIA_CONFIG = {
  allowedHosts: [new URL(TEST_MEDIA_HOST).hostname],
} as const

export function buildRawOobConfig(
  overrides: DeepPartial<RawOobConfig> = {},
): RawOobConfig {
  const base: RawOobConfig = {
    authentik: {
      issuerUrl: 'https://authentik.local/application/o/bss/',
      clientId: 'bss-stack-local',
      clientSecret: 'local-test-secret-not-for-production',
      scopes: ['openid', 'profile', 'email'],
      claims: {
        sub: 'sub',
      },
      groups: {
        admin: 'Admin',
        studio: 'Stúdiós',
        studioCandidate: 'Stúdiós jelölt',
        studioCandidateCandidate: 'Stúdiós jelölt-jelölt',
        leadership: 'Vezetőség',
        alumni: 'Öregtag',
      },
    },
    youtube: {
      oEmbedEndpoint: 'https://www.youtube.com/oembed',
    },
    media: {
      host: TEST_MEDIA_HOST,
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
