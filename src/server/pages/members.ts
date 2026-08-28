import { and, asc, eq, sql } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import { memberCache, staffRoles, videoStaff, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import type { membershipStatusEnum } from '#/db/schema.ts'

import type { ActivityRow, YearGroup, RoleGroup } from '#/lib/activity.ts'

type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number]

export const MEMBER_PAGE_SIZE = 50

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  studio_member: 'Stúdiós',
  studio_candidate: 'Stúdiósjelölt',
  studio_applicant: 'Stúdiósjelölt-jelölt',
  senior_active: 'Aktív öregtag',
  senior_archived: 'Archivált öregtag',
  contributor: 'Dolgozott még velünk',
}

export function semesterLabel(
  year: number | null,
  semester: 'spring' | 'autumn' | null,
): string | null {
  if (year === null || semester === null) {
    return null
  }
  return `${year} ${semester === 'autumn' ? 'ősz' : 'tavasz'}`
}

export interface PublicMemberCard {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
}

export interface ActiveMemberBlocks {
  leadership: Array<PublicMemberCard>
  studioMembers: Array<PublicMemberCard>
  studioCandidates: Array<PublicMemberCard>
  studioApplicants: Array<PublicMemberCard>
  seniorActive: Array<PublicMemberCard>
}

export async function getActiveMemberBlocks(
  executor: Executor,
): Promise<ActiveMemberBlocks> {
  const rows = await executor
    .select({
      sub: memberCache.sub,
      username: memberCache.username,
      fullName: memberCache.fullName,
      nickname: memberCache.nickname,
      avatarUrl: memberCache.avatarUrl,
      isLeadership: memberCache.isLeadership,
      status: memberCache.membershipStatus,
    })
    .from(memberCache)
    .where(eq(memberCache.syncStatus, 'ok'))
    .orderBy(asc(memberCache.fullName), asc(memberCache.sub))

  const toCard = (row: (typeof rows)[number]): PublicMemberCard => ({
    sub: row.sub,
    username: row.username,
    fullName: row.fullName,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
  })

  return {
    leadership: rows.filter((row) => row.isLeadership).map(toCard),
    studioMembers: rows
      .filter((row) => !row.isLeadership && row.status === 'studio_member')
      .map(toCard),
    studioCandidates: rows
      .filter((row) => row.status === 'studio_candidate')
      .map(toCard),
    studioApplicants: rows
      .filter((row) => row.status === 'studio_applicant')
      .map(toCard),
    seniorActive: rows
      .filter((row) => row.status === 'senior_active')
      .map(toCard),
  }
}

export type ArchiveKind = 'archived' | 'contributors'

const ARCHIVE_STATUS: Record<ArchiveKind, MembershipStatus> = {
  archived: 'senior_archived',
  contributors: 'contributor',
}

export interface MemberListPage {
  items: Array<PublicMemberCard>
  total: number
  page: number
  totalPages: number
  title: string
}

export async function getMemberArchivePage(
  executor: Executor,
  kind: ArchiveKind,
  params: { page?: number } = {},
): Promise<MemberListPage> {
  const status = ARCHIVE_STATUS[kind]
  const page =
    params.page !== undefined &&
    Number.isInteger(params.page) &&
    params.page > 0
      ? params.page
      : 1

  const condition = and(
    eq(memberCache.syncStatus, 'ok'),
    eq(memberCache.membershipStatus, status),
  )
  const [rows, countRows] = await Promise.all([
    executor
      .select({
        sub: memberCache.sub,
        username: memberCache.username,
        fullName: memberCache.fullName,
        nickname: memberCache.nickname,
        avatarUrl: memberCache.avatarUrl,
      })
      .from(memberCache)
      .where(condition)
      .orderBy(asc(memberCache.fullName), asc(memberCache.sub))
      .limit(MEMBER_PAGE_SIZE)
      .offset((page - 1) * MEMBER_PAGE_SIZE),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(memberCache)
      .where(condition),
  ])

  const total = countRows.at(0)?.count ?? 0
  return {
    items: rows,
    total,
    page,
    totalPages: Math.ceil(total / MEMBER_PAGE_SIZE),
    title: MEMBERSHIP_STATUS_LABELS[status],
  }
}

export interface MemberProfile {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  statusLabel: string
  isLeadership: boolean
  joinedSemester: string | null
  introduction: string | null
}

export async function getMemberProfile(
  executor: Executor,
  username: string,
): Promise<MemberProfile | null> {
  const rows = await executor
    .select()
    .from(memberCache)
    .where(
      and(eq(memberCache.username, username), eq(memberCache.syncStatus, 'ok')),
    )
    .limit(1)
  const member = rows.at(0)
  if (member === undefined) {
    return null
  }
  return {
    sub: member.sub,
    username: member.username,
    fullName: member.fullName,
    nickname: member.nickname,
    avatarUrl: member.avatarUrl,
    statusLabel: MEMBERSHIP_STATUS_LABELS[member.membershipStatus],
    isLeadership: member.isLeadership,
    joinedSemester: semesterLabel(member.joinedYear, member.joinedSemester),
    introduction: member.introduction,
  }
}

export type { ActivityRow, YearGroup, RoleGroup }

export interface ActivityPage {
  items: Array<ActivityRow>
  total: number
}

/**
 * Member activity: only published videos visible to the viewer, descending by
 * `recordedAt` (missing values at the end). With multiple roles the same video
 * appears in a single row with a role list.
 */
export async function getMemberActivity(
  executor: Executor,
  viewer: Viewer,
  memberSub: string,
  params: { limit?: number; offset?: number } = {},
): Promise<ActivityPage> {
  const limit = params.limit ?? MEMBER_PAGE_SIZE
  const offset = params.offset ?? 0

  const rowsResult = await executor.execute(sql`
    select v.id, v.slug, v.title,
      to_char(v.recorded_at, 'YYYY-MM-DD') as "recordedAt",
      extract(year from v.recorded_at)::int as year,
      coalesce(
        (select json_agg(r.name order by r.display_order, r.name)
         from ${videoStaff} vs
         join ${staffRoles} r on r.id = vs.role_id
         where vs.video_id = v.id and vs.member_sub = ${memberSub}),
        '[]'::json
      ) as roles,
      count(*) over () as total
    from ${videos} v
    where v.status = 'published'
      and exists (
        select 1 from ${videoStaff} vs2
        where vs2.video_id = v.id and vs2.member_sub = ${memberSub}
      )
      and (
        v.visibility = 'public'
        or ${sql.raw(viewer.level === 'schonherz' ? "(v.visibility in ('public','schonherz'))" : viewer.level === 'anonymous' ? 'false' : 'true')}
      )
    order by v.recorded_at desc nulls last, v.published_at desc nulls last, v.id
    limit ${limit} offset ${offset}
  `)

  const rawRows = rowsResult.rows as unknown as Array<
    Omit<ActivityRow, 'roles'> & { roles: string[]; total: number }
  >
  const first = rawRows.at(0)
  return {
    items: rawRows.map(({ total: _total, ...row }) => ({
      ...row,
      roles: row.roles,
    })),
    total: rawRows.length > 0 ? Number(first?.total ?? 0) : 0,
  }
}
