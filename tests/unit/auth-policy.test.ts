import { describe, expect, it } from 'vitest'
import {
  anonymousViewer,
  atLeast,
  viewerFromIdentity,
} from '#/server/auth/viewer.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { can, isLeadership, isAdminAreaAllowed } from '#/server/auth/policy.ts'
import {
  AuthRequiredError,
  ForbiddenError,
  requireAdmin,
  requireLeadership,
} from '#/server/auth/guards.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'

const config = validateOobConfig(buildRawOobConfig())

const anonymous: Viewer = anonymousViewer()
const schonherz: Viewer = {
  level: 'schonherz',
  sub: 's1',
  username: 'schonherz-dev',
}
const member: Viewer = viewerFromIdentity(
  { sub: 't1', username: 'tag-dev', groups: ['Stúdiós'] },
  config.authentik,
)

const leadership: Viewer = viewerFromIdentity(
  {
    sub: 'v1',
    username: 'vezetoseg-dev',
    groups: ['Vezetőség'],
  },
  config.authentik,
)
const admin: Viewer = viewerFromIdentity(
  { sub: 'a1', username: 'admin', groups: ['Admin'] },
  config.authentik,
)

describe('nézői szint felismerése csoportokból', () => {
  it('az Authentik csoportok helyesen oldódnak fel', () => {
    expect(anonymous.level).toBe('anonymous')
    expect(
      viewerFromIdentity(
        { sub: 's1', username: 'külsős', groups: ['más-csoport'] },
        config.authentik,
      ).level,
    ).toBe('anonymous')
    expect(member.level).toBe('member')
    expect(leadership.level).toBe('leadership')
    expect(admin.level).toBe('leadership')
  })

  it.each(['Stúdiós', 'Stúdiós jelölt', 'Stúdiós jelölt-jelölt', 'Öregtag'])(
    '%s csoport BSS-tagságot ad',
    (group) => {
      expect(
        viewerFromIdentity(
          { sub: group, username: group, groups: [group] },
          config.authentik,
        ).level,
      ).toBe('member')
    },
  )

  it('a vezetőségi jog magában foglalja a tagjogot', () => {
    for (const capability of Object.values(can)) {
      if (capability(member)) {
        expect(capability(leadership)).toBe(true)
      }
    }
  })
})

describe('admin jogosultsági mátrix (specifikáció 3.2)', () => {
  const matrix = [
    ['videó/esemény létrehozás', can.createOrEditContent, true, true],
    ['archiválás', can.archiveContent, true, true],
    ['lomtárba helyezés', can.trashVideo, true, true],
    ['lomtár megtekintése', can.viewTrash, true, true],
    ['visszaállítás', can.restoreVideo, false, true],
    ['esemény végleges törlése', can.permanentlyDeleteEvent, false, true],
    ['meglévő címke hozzárendelése', can.assignExistingTagToVideo, true, true],
    ['címkekatalógus kezelése', can.manageTagCatalog, false, true],
    ['stábszerepek kezelése', can.manageStaffRoles, false, true],
    ['stáblista egy videón', can.manageVideoStaffList, true, true],
    ['live/kiemelés/Rólunk kezelés', can.manageHomepageSettings, false, true],
    ['tagdiagnosztika', can.viewMemberDiagnostics, false, true],
    ['auditnapló', can.viewAuditLog, false, true],
  ] as const

  it.each(matrix)(
    '%s: tag=%p, vezetőség=%p',
    (_label, rule, memberAllowed, leadershipAllowed) => {
      expect(rule(member)).toBe(memberAllowed)
      expect(rule(leadership)).toBe(leadershipAllowed)
      // Névtelen és schönherzes soha nem kap adminjogot.
      expect(rule(anonymous)).toBe(false)
      expect(rule(schonherz)).toBe(false)
    },
  )

  it('tag nem kezelhet címkekatalógust, live-ot vagy auditot', () => {
    expect(can.manageTagCatalog(member)).toBe(false)
    expect(can.manageHomepageSettings(member)).toBe(false)
    expect(can.viewAuditLog(member)).toBe(false)
  })

  it('az adminterület bármely eleméhez legalább tagság kell', () => {
    expect(isAdminAreaAllowed(anonymous)).toBe(false)
    expect(isAdminAreaAllowed(schonherz)).toBe(false)
    expect(isAdminAreaAllowed(member)).toBe(true)
    expect(isAdminAreaAllowed(leadership)).toBe(true)
  })
})

describe('guard szabályok (403 / login irányítás)', () => {
  it('névtelen adminterületen loginra irányít megtartott returnTo-val', () => {
    try {
      requireAdmin(anonymous, '/videos?page=2')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AuthRequiredError)
      expect((error as AuthRequiredError).loginUrl).toBe(
        `/api/auth/login?returnTo=${encodeURIComponent('/videos?page=2')}`,
      )
    }
  })

  it('bejelentkezett, de jogosulatlan (schönherzes) ForbiddenError-t kap', () => {
    expect(() => requireAdmin(schonherz, '/')).toThrow(ForbiddenError)
  })

  it('tag beléphet az adminterületre; vezetőségi tag is', () => {
    expect(() => requireAdmin(member, '/')).not.toThrow()
    expect(() => requireAdmin(leadership, '/')).not.toThrow()
  })

  it('vezetőségi művelethez tag nem fér hozzá', () => {
    expect(() => requireLeadership(member)).toThrow(ForbiddenError)
    expect(() => requireLeadership(leadership)).not.toThrow()
    try {
      requireLeadership(anonymous)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AuthRequiredError)
    }
  })
})

describe('szintrendezés', () => {
  it('atLeast monoton', () => {
    expect(atLeast(anonymous, 'anonymous')).toBe(true)
    expect(atLeast(schonherz, 'anonymous')).toBe(true)
    expect(atLeast(schonherz, 'member')).toBe(false)
    expect(atLeast(member, 'leadership')).toBe(false)
    expect(atLeast(leadership, 'member')).toBe(true)
    expect(isLeadership(admin)).toBe(true)
  })
})
