import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'

export const OOB_DIR = 'oob'
export const SECRETS_FILE = 'local-secrets.json'
export const BLUEPRINT_FILE = join('authentik', 'blueprints', 'bss-local.yaml')
export const AUTHENTIK_ENV_FILE = 'authentik.env'
export const CONFIG_FILE = 'config.json'

export interface LocalSecrets {
  authentikSecretKey: string
  oidcClientSecret: string
  passwords: Record<string, string>
}

/**
 * Publikus alap URL-ek. Lan-eléréshez állítsd pl.:
 *   BSS_AUTHENTIK_BASE_URL=http://10.128.0.3:9000
 *   BSS_APP_BASE_URL=http://10.128.0.3:3000
 */
const AUTHENTIK_BASE_URL =
  process.env.BSS_AUTHENTIK_BASE_URL ?? 'http://127.0.0.1:9000'
const APP_BASE_URL = process.env.BSS_APP_BASE_URL ?? 'http://localhost:3000'
const OIDC_CLIENT_ID = 'bss-stack-local'

interface LocalUserSpec {
  username: string
  fullName: string
  nickname: string
  groups: string[]
  status: string | null
  joinedSemester: string | null
  introduction: string | null
}

export const LOCAL_USERS: LocalUserSpec[] = [
  {
    username: 'schonherz-dev',
    fullName: 'Schönherzes Teszt Felhasználó',
    nickname: 'Schi',
    groups: ['bss-schonherz'],
    status: null,
    joinedSemester: null,
    introduction: null,
  },
  {
    username: 'tag-dev',
    fullName: 'Teszt BSS Tag',
    nickname: 'Tagocska',
    groups: ['bss-tag'],
    status: 'stúdiós',
    joinedSemester: '2023/2024/1',
    introduction: 'Lokális teszt profil egy stúdiós szerepére.',
  },
  {
    username: 'vezetoseg-dev',
    fullName: 'Teszt Vezetőségi Tag',
    nickname: 'Vezér',
    groups: ['bss-tag', 'bss-vezetoseg'],
    status: 'stúdiós',
    joinedSemester: '2020/2021/2',
    introduction: 'Lokális teszt profil vezetőségi joggal.',
  },
  {
    username: 'jelolt-dev',
    fullName: 'Teszt Stúdiósjelölt',
    nickname: 'Jelöltke',
    groups: [],
    status: 'stúdiósjelölt',
    joinedSemester: '2025/2026/1',
    introduction: null,
  },
  {
    username: 'jeloltjelolt-dev',
    fullName: 'Teszt Stúdiósjelölt-jelölt',
    nickname: 'Jelcsa',
    groups: [],
    status: 'stúdiósjelölt-jelölt',
    joinedSemester: '2026/2027/1',
    introduction: null,
  },
  {
    username: 'oregtag-dev',
    fullName: 'Teszt Aktív Öregtag',
    nickname: 'Öreg',
    groups: [],
    status: 'aktív öregtag',
    joinedSemester: '2019/2020/1',
    introduction: null,
  },
  {
    username: 'archivalt-oregtag-dev',
    fullName: 'Teszt Archivált Öregtag',
    nickname: 'Archie',
    groups: [],
    status: 'archivált öregtag',
    joinedSemester: '2018/2019/1',
    introduction: null,
  },
  {
    username: 'kozremukodo-dev',
    fullName: 'Teszt Korábbi Közreműködő',
    nickname: 'Közreműködő',
    groups: [],
    status: 'dolgozott még velünk',
    joinedSemester: '2019/2020/2',
    introduction: null,
  },
]

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

export function generateLocalSecrets(): LocalSecrets {
  const passwords: Record<string, string> = {}
  for (const user of LOCAL_USERS) {
    passwords[user.username] = generateToken()
  }
  return {
    authentikSecretKey: generateToken(),
    oidcClientSecret: generateToken(),
    passwords,
  }
}

export function renderBlueprint(secrets: LocalSecrets): string {
  const userEntries = LOCAL_USERS.map((user) => {
    const lines: string[] = []

    if (user.groups.length > 0) {
      lines.push('      groups:')
      for (const group of user.groups) {
        lines.push(`        - !KeyOf id-${group}`)
      }
    }
    if (
      user.status !== null ||
      user.joinedSemester !== null ||
      user.introduction !== null
    ) {
      lines.push('      attributes:')
      if (user.status !== null) {
        lines.push(`        bss_status: "${user.status}"`)
      }
      if (user.joinedSemester !== null) {
        lines.push(`        bss_csatlakozas: "${user.joinedSemester}"`)
      }
      if (user.introduction !== null) {
        lines.push('        bss_bemutatkozas: >-')
        lines.push(`          ${user.introduction}`)
      }
    }

    return [
      '  - model: authentik_core.user',
      '    identifiers:',
      `      username: ${user.username}`,
      '    attrs:',
      `      name: ${user.fullName}`,
      `      username: ${user.username}`,
      '      type: internal',
      `      password: "${secrets.passwords[user.username]}"`,
      ...lines,
    ].join('\n')
  }).join('\n')

  return [
    '# AUTOMATIKUSAN GENERÁLT FÁJL - NE SZERKESZD KÉZZEL!',
    '# A scripts/bootstrap-local.ts hozza létre az oob/ könyvtárba.',
    'version: 1',
    'entries:',
    '  - model: authentik_flows.flow',
    '    id: id-authn-flow',
    '    identifiers:',
    '      slug: bss-local-authentication',
    '    attrs:',
    '      name: bss-local-authentication',
    '      title: Bejelentkezés a BSS Stackbe',
    '      designation: authentication',
    '      authentication: none',
    '      denied_action: message_continue',
    '  - model: authentik_flows.flow',
    '    id: id-authz-flow',
    '    identifiers:',
    '      slug: bss-local-authorization',
    '    attrs:',
    '      name: bss-local-authorization',
    '      title: Hozzáférés engedélyezése',
    '      designation: authorization',
    '      authentication: require_authenticated',
    '      denied_action: message_continue',
    '  - model: authentik_stages_identification.identificationstage',
    '    id: id-stage-identification',
    '    identifiers:',
    '      name: bss-local-identification',
    '    attrs:',
    '      name: bss-local-identification',
    '      user_fields:',
    '        - username',
    '      case_insensitive_matching: true',
    '  - model: authentik_stages_password.passwordstage',
    '    id: id-stage-password',
    '    identifiers:',
    '      name: bss-local-password',
    '    attrs:',
    '      name: bss-local-password',
    '      backends:',
    '        - authentik.core.auth.InbuiltBackend',
    '  - model: authentik_stages_user_login.userloginstage',
    '    id: id-stage-login',
    '    identifiers:',
    '      name: bss-local-user-login',
    '    attrs:',
    '      name: bss-local-user-login',
    '      session_duration: days=1',
    '  - model: authentik_flows.flowstagebinding',
    '    identifiers:',
    '      order: 0',
    '      target: !KeyOf id-authn-flow',
    '    attrs:',
    '      order: 0',
    '      target: !KeyOf id-authn-flow',
    '      stage: !KeyOf id-stage-identification',
    '  - model: authentik_flows.flowstagebinding',
    '    identifiers:',
    '      order: 1',
    '      target: !KeyOf id-authn-flow',
    '    attrs:',
    '      order: 1',
    '      target: !KeyOf id-authn-flow',
    '      stage: !KeyOf id-stage-password',
    '  - model: authentik_flows.flowstagebinding',
    '    identifiers:',
    '      order: 2',
    '      target: !KeyOf id-authn-flow',
    '    attrs:',
    '      order: 2',
    '      target: !KeyOf id-authn-flow',
    '      stage: !KeyOf id-stage-login',
    '  - model: authentik_core.group',
    '    id: id-bss-schonherz',
    '    identifiers:',
    '      name: bss-schonherz',
    '    attrs:',
    '      name: bss-schonherz',
    '      is_superuser: false',
    '  - model: authentik_core.group',
    '    id: id-bss-tag',
    '    identifiers:',
    '      name: bss-tag',
    '    attrs:',
    '      name: bss-tag',
    '      is_superuser: false',
    '  - model: authentik_core.group',
    '    id: id-bss-vezetoseg',
    '    identifiers:',
    '      name: bss-vezetoseg',
    '    attrs:',
    '      name: bss-vezetoseg',
    '      is_superuser: false',
    userEntries,
    '  - model: authentik_providers_oauth2.scopemapping',
    '    id: id-map-profile',
    '    identifiers:',
    '      name: bss-local-scope-profile',
    '    attrs:',
    '      name: bss-local-scope-profile',
    '      scope_name: profile',
    '      description: Profil adatok',
    '      expression: |',
    '        return {',
    '          "preferred_username": request.user.username,',
    '          "name": request.user.name,',
    '          "nickname": request.user.attributes.get("nickname", request.user.username),',
    '          "picture": request.user.avatar,',
    '          "groups": [group.name for group in request.user.groups.all()],',
    '        }',
    '  - model: authentik_providers_oauth2.scopemapping',
    '    id: id-map-email',
    '    identifiers:',
    '      name: bss-local-scope-email',
    '    attrs:',
    '      name: bss-local-scope-email',
    '      scope_name: email',
    '      description: Email cím',
    '      expression: |',
    '        return {"email": request.user.email, "email_verified": True}',
    '  - model: authentik_providers_oauth2.scopemapping',
    '    id: id-map-bss',
    '    identifiers:',
    '      name: bss-custom-claims',
    '    attrs:',
    '      name: bss-custom-claims',
    '      scope_name: bss',
    '      description: BSS tagsági attribútumok',
    '      expression: |',
    '        return {',
    '          "bss_status": request.user.attributes.get("bss_status", ""),',
    '          "bss_csatlakozas": request.user.attributes.get("bss_csatlakozas", ""),',
    '          "bss_bemutatkozas": request.user.attributes.get("bss_bemutatkozas", "")',
    '        }',
    '  - model: authentik_providers_oauth2.oauth2provider',
    '    id: bss-stack-provider',
    '    identifiers:',
    '      name: bss-stack-provider',
    '    attrs:',
    '      name: bss-stack-provider',
    `      client_id: ${OIDC_CLIENT_ID}`,
    `      client_secret: "${secrets.oidcClientSecret}"`,
    '      redirect_uris:',
    '        - matching_mode: strict',
    '          url: http://localhost:3000/api/auth/callback',
    '        - matching_mode: strict',
    '          url: http://127.0.0.1:3000/api/auth/callback',
    ...(APP_BASE_URL === 'http://localhost:3000' ||
    APP_BASE_URL === 'http://127.0.0.1:3000'
      ? []
      : [
          '        - matching_mode: strict',
          `          url: ${APP_BASE_URL}/api/auth/callback`,
        ]),
    '      grant_types:',
    '        - authorization_code',
    '        - refresh_token',
    '        - client_credentials',
    '      authorization_flow: !KeyOf id-authz-flow',
    '      invalidation_flow: !Find [authentik_flows.Flow, [slug, default-provider-invalidation-flow]]',
    '      property_mappings:',
    '        - !KeyOf id-map-profile',
    '        - !KeyOf id-map-email',
    '        - !KeyOf id-map-bss',
    '        - !KeyOf id-map-api-scope',
    '      # user_id sub: a webhookon beküldött sub értéke az API pk-ja',
    '      sub_mode: user_id',
    '      access_token_validity: hours=1',
    '      signing_key: !Find [authentik_crypto.certificatekeypair, [name, authentik Self-signed Certificate]]',
    '  - model: authentik_core.application',
    '    identifiers:',
    '      slug: bss-stack',
    '    attrs:',
    '      name: BSS Stack',
    '      slug: bss-stack',
    '      provider: !KeyOf bss-stack-provider',
    '',
  ].join('\n')
}

export function renderOobConfig(secrets: LocalSecrets): unknown {
  return {
    authentik: {
      issuerUrl: `${AUTHENTIK_BASE_URL}/application/o/bss-stack/`,
      clientId: OIDC_CLIENT_ID,
      clientSecret: secrets.oidcClientSecret,
      scopes: ['openid', 'profile', 'email', 'bss'],
      claims: {
        sub: 'sub',
        username: 'preferred_username',
        fullName: 'name',
        nickname: 'nickname',
        avatarUrl: 'picture',
      },
      groups: {
        schonherz: 'bss-schonherz',
        tag: 'bss-tag',
        vezetoseg: 'bss-vezetoseg',
      },
    },
    youtube: {
      oEmbedEndpoint: 'https://www.youtube.com/oEmbed',
    },
    seed: {
      path: 'oob/seed.json',
    },
  }
}

export function writeLocalFiles(baseDir: string): {
  secrets: LocalSecrets
  created: boolean
} {
  const oobDir = join(baseDir, OOB_DIR)
  mkdirSync(join(oobDir, 'authentik', 'blueprints'), { recursive: true })

  const secretsPath = join(oobDir, SECRETS_FILE)
  let secrets: LocalSecrets
  let created = false

  if (existsSync(secretsPath)) {
    secrets = JSON.parse(readFileSync(secretsPath, 'utf-8')) as LocalSecrets
    // Újabb mezők utólagos kiegészítése régi titokfájlon (idempotens futás).
  } else {
    secrets = generateLocalSecrets()
    writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`)
    created = true
  }

  writeFileSync(join(oobDir, BLUEPRINT_FILE), renderBlueprint(secrets))
  writeFileSync(
    join(oobDir, AUTHENTIK_ENV_FILE),
    `AUTHENTIK_SECRET_KEY=${secrets.authentikSecretKey}\n`,
  )

  const rawConfig = renderOobConfig(secrets)
  const validated: OobConfig = validateOobConfig(rawConfig)
  writeFileSync(
    join(oobDir, CONFIG_FILE),
    `${JSON.stringify(rawConfig, null, 2)}\n`,
  )
  void validated

  return { secrets, created }
}
