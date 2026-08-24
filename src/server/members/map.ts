import type {
  MembershipStatusKey,
  OobConfig,
  SemesterKey,
} from '#/server/config/oob-schema.ts'
import type { AuthentikApiUser } from './authentik-api.ts'

export type MemberSyncStatus = 'ok' | 'error'

export interface MappedMember {
  /** The Authentik sub value (the pk when user_id sub_mode is used). */
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  membershipStatus: MembershipStatusKey
  isLeadership: boolean
  joinedYear: number | null
  joinedSemester: SemesterKey | null
  joinedSemesterRaw: string | null
  introduction: string | null
  syncStatus: MemberSyncStatus
  syncError: string | null
}

/** System users that do not belong to the member cache. */
export function isSystemUser(user: AuthentikApiUser): boolean {
  return (
    user.type !== 'internal' ||
    user.username.startsWith('ak-') ||
    user.username.startsWith('svc-')
  )
}

export function mapMembershipStatus(
  rawStatus: unknown,
  config: OobConfig['authentik'],
): MembershipStatusKey | null {
  if (typeof rawStatus !== 'string') {
    return null
  }
  return config.attributes.membershipStatus.values[rawStatus.trim()] ?? null
}

export function parseJoinedSemester(
  rawValue: unknown,
  config: OobConfig['authentik'],
): { year: number; semester: SemesterKey } | { year: null; semester: null } {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return { year: null, semester: null }
  }
  for (const rule of config.attributes.joinedSemester.rules) {
    const match = rule.pattern.exec(rawValue.trim())
    if (match) {
      const year = Number(match[1])
      if (Number.isInteger(year)) {
        return { year, semester: rule.semester }
      }
    }
  }
  return { year: null, semester: null }
}

/**
 * Maps an Authentik user to a member cache record.
 * If the membership status is unknown or missing, syncStatus='error':
 * the last known data may be preserved, but the member is not placed
 * into the public group.
 */
export function mapMember(
  user: AuthentikApiUser,
  groupNames: ReadonlySet<string>,
  config: OobConfig['authentik'],
): MappedMember | null {
  if (isSystemUser(user)) {
    return null
  }

  const attributes: Record<string, unknown> = user.attributes
  const rawStatus = attributes[config.attributes.membershipStatus.attribute]
  const membershipStatus = mapMembershipStatus(rawStatus, config)

  const joinedRawValue = attributes[config.attributes.joinedSemester.attribute]
  const semester = parseJoinedSemester(joinedRawValue, config)

  const rawIntroduction = attributes[config.attributes.introduction]
  const introduction =
    typeof rawIntroduction === 'string' && rawIntroduction.trim() !== ''
      ? rawIntroduction
      : null

  const rawNickname = attributes[config.claims.nickname]
  const nickname =
    typeof rawNickname === 'string' && rawNickname.trim() !== ''
      ? rawNickname
      : null

  let syncError: string | null = null
  if (membershipStatus === null) {
    syncError = `Ismeretlen vagy hiányzó tagsági státusz: ${JSON.stringify(
      rawStatus === undefined ? null : rawStatus,
    )}`
  }

  const isLeadership = groupNames.has(config.groups.vezetoseg)

  return {
    sub: String(user.pk),
    username: user.username,
    fullName: user.name !== '' ? user.name : user.username,
    nickname,
    avatarUrl: user.avatarUrl,
    membershipStatus: membershipStatus ?? 'studio_member',
    isLeadership: isLeadership && membershipStatus !== null,
    joinedYear: semester.year,
    joinedSemester: semester.semester,
    joinedSemesterRaw:
      typeof joinedRawValue === 'string' && joinedRawValue.trim() !== ''
        ? joinedRawValue.trim()
        : null,
    introduction,
    syncStatus: membershipStatus === null ? 'error' : 'ok',
    syncError,
  }
}
