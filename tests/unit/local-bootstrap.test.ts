import { afterEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LOCAL_USERS,
  renderBlueprint,
  renderOobConfig,
  writeLocalFiles,
} from '../../scripts/lib/local-bootstrap.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'

const cleanupDirs: string[] = []

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true })
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bss-bootstrap-'))
  cleanupDirs.push(dir)
  return dir
}

describe('lokális Authentik bootstrap', () => {
  it('mindhárom nézői szint és mindkét adminszerep tesztadatot kap', () => {
    const usernames = LOCAL_USERS.map((user) => user.username)
    expect(usernames).toContain('schonherz-dev')
    expect(usernames).toContain('tag-dev')
    expect(usernames).toContain('vezetoseg-dev')

    const tag = LOCAL_USERS.find((user) => user.username === 'tag-dev')!
    expect(tag.groups).toContain('bss-tag')

    const leadership = LOCAL_USERS.find(
      (user) => user.username === 'vezetoseg-dev',
    )!
    expect(leadership.groups).toContain('bss-tag')
    expect(leadership.groups).toContain('bss-vezetoseg')

    const schonherz = LOCAL_USERS.find(
      (user) => user.username === 'schonherz-dev',
    )!
    expect(schonherz.groups).not.toContain('bss-tag')

    const statuses = LOCAL_USERS.map((user) => user.status)
    expect(statuses).toEqual(
      expect.arrayContaining([
        'stúdiós',
        'stúdiósjelölt',
        'stúdiósjelölt-jelölt',
        'aktív öregtag',
        'archivált öregtag',
        'dolgozott még velünk',
      ]),
    )
  })

  it('a generált config átmegy az OOB validáción', () => {
    const secrets = {
      authentikSecretKey: 'secret-key-value',
      oidcClientSecret: 'client-secret-value',
      syncApiToken: 'sync-token-value',
      passwords: {},
    }
    const validated = validateOobConfig(renderOobConfig(secrets))
    expect(validated.authentik.clientId).toBe('bss-stack-local')
    expect(validated.authentik.groups.tag).toBe('bss-tag')
    expect(
      Object.keys(validated.authentik.attributes.membershipStatus.values),
    ).toHaveLength(6)
  })

  it('a blueprint tartalmazza a csoportokat, felhasználókat és a providert', () => {
    const secrets = {
      authentikSecretKey: 'secret-key-value',
      oidcClientSecret: 'client-secret-value',
      syncApiToken: 'sync-token-value',
      passwords: { 'tag-dev': 'jelszo1' },
    }
    const yaml = renderBlueprint(secrets)

    for (const group of ['bss-schonherz', 'bss-tag', 'bss-vezetoseg']) {
      expect(yaml).toContain(`name: ${group}`)
    }
    for (const user of LOCAL_USERS) {
      expect(yaml).toContain(`username: ${user.username}`)
    }
    expect(yaml).toContain('authentik_providers_oauth2.oauth2provider')
    expect(yaml).toContain('client_id: bss-stack-local')
    expect(yaml).toContain('http://localhost:3000/api/auth/callback')
    expect(yaml).toContain('password: "jelszo1"')
  })

  it('idempotens: újrafuttatás nem generál új titkokat és nem duplikál', () => {
    const dir = tempDir()
    const first = writeLocalFiles(dir)
    const blueprintPath = join(
      dir,
      'oob',
      'authentik',
      'blueprints',
      'bss-local.yaml',
    )
    const firstBlueprint = readFileSync(blueprintPath, 'utf-8')

    const second = writeLocalFiles(dir)
    const secondBlueprint = readFileSync(blueprintPath, 'utf-8')

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.secrets.oidcClientSecret).toBe(first.secrets.oidcClientSecret)
    expect(secondBlueprint).toBe(firstBlueprint)
    expect(existsSync(join(dir, 'oob', 'config.json'))).toBe(true)
    expect(existsSync(join(dir, 'oob', 'authentik.env'))).toBe(true)
  })

  it('módosított meglévő titokfájl mellett nem írja felül', () => {
    const dir = tempDir()
    writeLocalFiles(dir)
    const secretsPath = join(dir, 'oob', 'local-secrets.json')
    const original = JSON.parse(readFileSync(secretsPath, 'utf-8'))
    original.oidcClientSecret = 'megmarado-ertek'
    writeFileSync(secretsPath, JSON.stringify(original))

    writeLocalFiles(dir)
    const after = JSON.parse(readFileSync(secretsPath, 'utf-8'))
    expect(after.oidcClientSecret).toBe('megmarado-ertek')
  })
})
