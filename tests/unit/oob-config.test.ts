import { describe, expect, it } from 'vitest'
import {
  OobConfigError,
  validateOobConfig,
} from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'

describe('OOB config validáció', () => {
  it('érvényes konfigurációnál típusos objektumot ad', () => {
    const config = validateOobConfig(buildRawOobConfig())
    expect(config.authentik.clientId).toBe('bss-stack-local')
    expect(config.authentik.claims.sub).toBe('sub')
    expect(config.authentik.groups.tag).toBe('tag-dev')
    expect(config.media.host).toBe('https://v.bsstudio.hu')
    expect(config.media.allowedHosts).toEqual(['v.bsstudio.hu'])
  })

  it('hiányzó szekciókra konkrét hibaüzenetet ad', () => {
    expect(() => validateOobConfig({})).toThrow(OobConfigError)
    try {
      validateOobConfig({})
      expect.unreachable()
    } catch (error) {
      const problems = (error as OobConfigError).problems
      expect(problems.some((p) => p.startsWith('authentik:'))).toBe(true)
      expect(problems.some((p) => p.startsWith('youtube:'))).toBe(true)
      expect(problems.some((p) => p.startsWith('media:'))).toBe(true)
      expect(problems.some((p) => p.startsWith('seed:'))).toBe(true)
    }
  })

  it('üres titok nem elfogadott, félkonfigurált auth mód nincs', () => {
    const raw = buildRawOobConfig()
    raw.authentik.clientSecret = ''

    expect(() => validateOobConfig(raw)).toThrow(/clientSecret/)
  })

  it('azonos csoportnevek elfogadatlanok', () => {
    const raw = buildRawOobConfig({
      authentik: {
        groups: {
          schonherz: 'ugyanaz',
          tag: 'ugyanaz',
          vezetoseg: 'vezetoseg-dev',
        },
      },
    })

    expect(() => validateOobConfig(raw)).toThrow(
      /minden csoportnévnek különböznie kell/,
    )
  })

  it('openid scope nélkül hibát dob', () => {
    const raw = buildRawOobConfig({ authentik: { scopes: ['profile'] } })
    expect(() => validateOobConfig(raw)).toThrow(/openid/)
  })
})
