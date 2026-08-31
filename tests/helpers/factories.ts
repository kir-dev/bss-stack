export type Visibility = 'public' | 'schonherz' | 'bss'
export type ContentStatus = 'draft' | 'published' | 'archived' | 'trash'
export type EventStatus = 'draft' | 'published' | 'archived'

let sequence = 0

function nextId(): string {
  sequence += 1
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

export interface VideoFixture {
  id: string
  slug: string
  title: string
  description: string | null
  guests: string | null
  songs: string | null
  encodingGroup: '4a3_SD' | '16a9_SD' | '16a9_HD'
  hasHq: boolean
  hasLq: boolean
  baseFilename: string
  visibility: Visibility
  status: ContentStatus
  createdAt: Date
  updatedAt: Date
  publishedAt: Date | null
  recordedAt: string | null
  viewCount: number
  eventId: string | null
  version: number
}

export function buildVideo(
  overrides: Partial<VideoFixture> = {},
): VideoFixture {
  const id = overrides.id ?? nextId()
  const title = overrides.title ?? 'Teszt videó'
  return {
    id,
    slug: overrides.slug ?? `teszt-video-${sequence}`,
    title,
    description: null,
    guests: null,
    songs: null,
    encodingGroup: '16a9_HD',
    hasHq: true,
    hasLq: true,
    baseFilename: `video-${sequence}`,
    visibility: 'public',
    status: 'draft',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    publishedAt: null,
    recordedAt: null,
    viewCount: 0,
    eventId: null,
    version: 1,
    ...overrides,
  }
}

export interface EventFixture {
  id: string
  slug: string
  title: string
  description: string | null
  thumbnailUrl: string | null
  startDate: string
  endDate: string | null
  status: EventStatus
  createdAt: Date
  updatedAt: Date
  version: number
}

export function buildEvent(
  overrides: Partial<EventFixture> = {},
): EventFixture {
  const id = overrides.id ?? nextId()
  const title = overrides.title ?? 'Teszt esemény'
  return {
    id,
    slug: overrides.slug ?? `teszt-esemeny-${sequence}`,
    title,
    description: null,
    thumbnailUrl: null,
    startDate: '2026-05-01',
    endDate: null,
    status: 'published',
    createdAt: new Date('2026-04-01T10:00:00.000Z'),
    updatedAt: new Date('2026-04-01T10:00:00.000Z'),
    version: 1,
    ...overrides,
  }
}

export interface TagFixture {
  id: string
  name: string
}

export function buildTag(overrides: Partial<TagFixture> = {}): TagFixture {
  return {
    id: overrides.id ?? nextId(),
    name: overrides.name ?? 'Teszt címke',
  }
}

export type MembershipStatus =
  | 'MEMBER'
  | 'MEMBER_CANDIDATE'
  | 'MEMBER_CANDIDATE_CANDIDATE'
  | 'ACTIVE_ALUMNI'
  | 'ALUMNI'

export interface MemberFixture {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  membershipStatus: MembershipStatus
  isLeadership: boolean
  joinedYear: number | null
  joinedSemester: 'spring' | 'autumn' | null
  introduction: string | null
  deletedAt: Date | null
}

export function buildMember(
  overrides: Partial<MemberFixture> = {},
): MemberFixture {
  const username = overrides.username ?? `teszt-tag-${sequence}`
  return {
    sub: overrides.sub ?? nextId(),
    username,
    fullName: overrides.fullName ?? 'Teszt Teljes Név',
    nickname: overrides.nickname ?? 'Teszti',
    avatarUrl: null,
    membershipStatus: overrides.membershipStatus ?? 'MEMBER',
    isLeadership: overrides.isLeadership ?? false,
    joinedYear: overrides.joinedYear ?? 2023,
    joinedSemester: overrides.joinedSemester ?? 'autumn',
    introduction: overrides.introduction ?? null,
    deletedAt: overrides.deletedAt ?? null,
    ...overrides,
  }
}
