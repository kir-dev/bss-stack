import { describe, expect, it } from 'vitest'
import {
  isSystemUser,
  mapMember,
  mapMembershipStatus,
  parseJoinedSemester,
} from '#/server/members/map.ts'
import type { AuthentikApiUser } from '#/server/members/authentik-api.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'

const config = validateOobConfig(buildRawOobConfig())

const GROUPS = new Set(Object.values(config.authentik.groups))

function buildApiUser(
  overrides: Partial<AuthentikApiUser> = {},
): AuthentikApiUser {
  return {
    pk: 36,
    username: 'tag-dev',
    name: 'Teszt BSS Tag',
    isActive: true,
    type: 'internal',
    avatarUrl: null,
    attributes: {
      bss_status: 'stúdiós',
      bss_csatlakozas: '2023 ősz',
      bss_bemutatkozas: 'Bemutatkozás',
      nickname: 'Tagocska',
    },
    groups: [config.authentik.groups.tag],
    ...overrides,
  }
}

describe('tagsági státusz mapping', () => {
  it('minden konfigurált nyers státusz feloldódik', () => {
    for (const raw of Object.keys(
      config.authentik.attributes.membershipStatus.values,
    )) {
      expect(mapMembershipStatus(raw, config.authentik)).not.toBeNull()
    }
  })

  it('ismeretlen státusz nullát ad (nem találgat)', () => {
    expect(mapMembershipStatus('nincs ilyen', config.authentik)).toBeNull()
    expect(mapMembershipStatus(undefined, config.authentik)).toBeNull()
    expect(mapMembershipStatus('', config.authentik)).toBeNull()
  })
})

describe('csatlakozási félév értelmezés', () => {
  it('ősz és tavasz szabályok szerint év + félév', () => {
    expect(parseJoinedSemester('2023 ősz', config.authentik)).toEqual({
      year: 2023,
      semester: 'autumn',
    })
    expect(parseJoinedSemester('2021 tavasz', config.authentik)).toEqual({
      year: 2021,
      semester: 'spring',
    })
    expect(parseJoinedSemester('2019 őszi', config.authentik)).toEqual({
      year: 2019,
      semester: 'autumn',
    })
  })

  it('nyers érték ismeretlen formátuma hibát nem dob, csak nincs eredmény', () => {
    expect(parseJoinedSemester('ősz 2023', config.authentik)).toEqual({
      year: null,
      semester: null,
    })
    expect(parseJoinedSemester(null, config.authentik)).toEqual({
      year: null,
      semester: null,
    })
  })
})

describe('teljes tag mapping', () => {
  it('a konfig szerint képez le és a vezetőséget csoportnév alapján állítja', () => {
    const leadershipGroups = new Set([
      config.authentik.groups.tag,
      config.authentik.groups.vezetoseg,
    ])
    const mapped = mapMember(
      buildApiUser({ groups: [config.authentik.groups.vezetoseg] }),
      leadershipGroups,
      config.authentik,
    )!

    expect(mapped.syncStatus).toBe('ok')
    expect(mapped.sub).toBe('36')
    expect(mapped.fullName).toBe('Teszt BSS Tag')
    expect(mapped.nickname).toBe('Tagocska')
    expect(mapped.membershipStatus).toBe('studio_member')
    expect(mapped.isLeadership).toBe(true)
    expect(mapped.joinedYear).toBe(2023)
    expect(mapped.joinedSemester).toBe('autumn')
    expect(mapped.joinedSemesterRaw).toBe('2023 ősz')
    expect(mapped.introduction).toBe('Bemutatkozás')
    expect(mapped.syncError).toBeNull()
  })

  it('hiányzó státusznál hibás jelölést kap, publikus adat nem veszik el', () => {
    const mapped = mapMember(
      buildApiUser({ attributes: {} }),
      GROUPS,
      config.authentik,
    )!

    expect(mapped.syncStatus).toBe('error')
    expect(mapped.syncError).toContain(
      'Ismeretlen vagy hiányzó tagsági státusz',
    )
  })

  it('rossz félévformátumnál az év és félév üres marad', () => {
    const mapped = mapMember(
      buildApiUser({
        attributes: { bss_status: 'stúdiós', bss_csatlakozas: 'valamikor' },
      }),
      GROUPS,
      config.authentik,
    )!
    expect(mapped.joinedYear).toBeNull()
    expect(mapped.joinedSemester).toBeNull()
    expect(mapped.joinedSemesterRaw).toBe('valamikor')
    // A státusz érvényes, így a profil maga ok
    expect(mapped.syncStatus).toBe('ok')
  })

  it('vezetőségi csoport önmagában nem tesz taggá valakivé', () => {
    const onlyVezetoseg = new Set([config.authentik.groups.vezetoseg])
    const mapped = mapMember(
      buildApiUser({ groups: [config.authentik.groups.vezetoseg] }),
      onlyVezetoseg,
      config.authentik,
    )!
    expect(mapped.isLeadership).toBe(true)
  })

  it('rendszerfelhasználók kimaradnak a cache-ből', () => {
    expect(isSystemUser(buildApiUser({ username: 'ak-outpost-xyz' }))).toBe(
      true,
    )
    expect(isSystemUser(buildApiUser({ username: 'svc-bss-sync' }))).toBe(true)
    expect(isSystemUser(buildApiUser({ type: 'service_account' }))).toBe(true)
    expect(isSystemUser(buildApiUser())).toBe(false)
    expect(
      mapMember(
        buildApiUser({ username: 'svc-bss-sync' }),
        GROUPS,
        config.authentik,
      ),
    ).toBeNull()
  })
})
