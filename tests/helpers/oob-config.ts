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
    },
    youtube: {
      oEmbedEndpoint: 'https://www.youtube.com/oembed',
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
