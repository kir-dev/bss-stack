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
    expect(config.media.allowedHosts).toEqual(['v.bsstudio.hu'])
    expect(config.authentik.attributes.joinedSemester.rules).toHaveLength(2)
    expect(
      config.authentik.attributes.joinedSemester.rules[0].pattern,
    ).toBeInstanceOf(RegExp)
    expect(config.authentik.attributes.membershipStatus.values['stúdiós']).toBe(
      'studio_member',
    )
  })

  it('hiányzó szekciókra konkrét hibaüzenetet ad', () => {
    expect(() => validateOobConfig({})).toThrow(OobConfigError)
    try {
      validateOobConfig({})
      expect.unreachable()
    } catch (error) {
      const problems = (error as OobConfigError).problems
      expect(problems.some((p) => p.startsWith('authentik:'))).toBe(true)
      expect(problems.some((p) => p.startsWith('media:'))).toBe(true)
      expect(problems.some((p) => p.startsWith('youtube:'))).toBe(true)
      expect(problems.some((p) => p.startsWith('seed:'))).toBe(true)
    }
  })

  it('üres titok nem elfogadott, félkonfigurált auth mód nincs', () => {
    const raw = buildRawOobConfig()
    raw.authentik.clientSecret = ''

    expect(() => validateOobConfig(raw)).toThrow(/clientSecret/)
  })

  it('ismeretlen tagsági státusz célra hibát dob, nem talál ki értéket', () => {
    const raw = buildRawOobConfig()
    raw.authentik.attributes.membershipStatus.values = {
      'kitalalt-status': 'nem_letezo_kulcs',
    }

    expect(() => validateOobConfig(raw)).toThrow(
      /ismeretlen célállapot "nem_letezo_kulcs"/,
    )
  })

  it('érvénytelen félévszabály regexre hibát dob', () => {
    const raw = buildRawOobConfig()
    raw.authentik.attributes.joinedSemester.rules[0].pattern = '([évtelen'

    expect(() => validateOobConfig(raw)).toThrow(
      /érvénytelen reguláris kifejezés/,
    )
  })

  it('ismeretlen félév értékre hibát dob', () => {
    const raw = buildRawOobConfig()
    raw.authentik.attributes.joinedSemester.rules[0].semester = 'tel'

    expect(() => validateOobConfig(raw)).toThrow(
      /csak "spring" vagy "autumn" lehet/,
    )
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

  it('média host lista nem lehet üres', () => {
    const raw = buildRawOobConfig({ media: { allowedHosts: [] } })
    expect(() => validateOobConfig(raw)).toThrow(/allowedHosts/)
  })
})
