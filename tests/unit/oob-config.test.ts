import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEED_PATH,
  OobConfigError,
  validateOobConfig,
} from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'

describe('OOB config validáció', () => {
  it('érvényes konfigurációnál típusos objektumot ad', () => {
    const config = validateOobConfig(buildRawOobConfig())
    expect(config.authentik.clientId).toBe('bss-stack-local')
    expect(config.authentik.claims.sub).toBe('sub')
    expect(config.authentik.groups.studio).toBe('Stúdiós')
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
    }
  })

  it('a seed szekció opcionális; hiányában az alapértelmezett helyet használja', () => {
    const config = validateOobConfig({
      ...buildRawOobConfig(),
      seed: undefined,
    })
    expect(config.seed.path).toBe(DEFAULT_SEED_PATH)
  })

  it('nem objektum seed szekcióra hibát dob', () => {
    expect(() =>
      validateOobConfig({ ...buildRawOobConfig(), seed: 'oob/seed.json' }),
    ).toThrow(/seed: objektum kell legyen/)
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
          admin: 'ugyanaz',
          studio: 'ugyanaz',
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

  it('az authsch szekció opcionális; hiányában az AuthSCH belépés ki van kapcsolva', () => {
    expect(validateOobConfig(buildRawOobConfig()).authsch).toBeNull()
  })

  it('megadott authsch szekciót az Authentikkel azonos szabályokkal ellenőriz', () => {
    const valid = validateOobConfig({
      ...buildRawOobConfig(),
      authsch: {
        issuerUrl: 'https://auth.sch.bme.hu',
        clientId: 'bss-authsch',
        clientSecret: 'authsch-titok',
        scopes: ['openid', 'profile'],
      },
    })
    expect(valid.authsch).toEqual({
      issuerUrl: 'https://auth.sch.bme.hu',
      clientId: 'bss-authsch',
      clientSecret: 'authsch-titok',
      scopes: ['openid', 'profile'],
    })

    try {
      validateOobConfig({
        ...buildRawOobConfig(),
        authsch: {
          issuerUrl: 'http://auth.sch.bme.hu',
          clientId: 'bss-authsch',
          clientSecret: '',
          scopes: ['profile'],
        },
      })
      expect.unreachable()
    } catch (error) {
      const problems = (error as OobConfigError).problems
      expect(problems).toContain(
        'authsch.clientSecret: kötelező szövegmező, hiányzik vagy üres.',
      )
      expect(problems.some((p) => p.startsWith('authsch.issuerUrl:'))).toBe(
        true,
      )
      expect(problems).toContain('authsch.scopes: az openid scope kötelező.')
    }
  })
})
