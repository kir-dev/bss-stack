import type { OobConfig } from '#/server/config/oob-schema.ts'
import { checkMediaUrlShape } from '#/server/media/validator.ts'
import { TEXT_LIMITS } from '#/server/shared/text.ts'
import { slugify } from '#/server/shared/slug.ts'

/**
 * The format of the seed JSON (BSS-034, spec 17.1): the output of the scraper,
 * loaded by the idempotent seed importer. It must not contain personal data
 * (email, introduction) or media files; people are referenced by the usernames
 * of the local Authentik bootstrap test profiles.
 */
export interface SeedEvent {
  key: string
  title: string
  slug: string
  description: string | null
  thumbnailUrl: string | null
  startDate: string | null
  endDate: string | null
  status: 'draft' | 'published' | 'archived'
}

export interface SeedStaffEntry {
  username: string
  role: string
}

export interface SeedVideo {
  key: string
  title: string
  slug: string
  description: string | null
  guests: string | null
  songs: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  visibility: 'public' | 'schonherz' | 'bss'
  status: 'draft' | 'published' | 'archived'
  recordedAt: string | null
  publishedAt: Date | null
  eventKey: string | null
  tags: string[]
  staff: SeedStaffEntry[]
}

export interface SeedFile {
  version: 1
  events: SeedEvent[]
  tags: string[]
  staffRoles: string[]
  videos: SeedVideo[]
}

/** Fields forbidden in the seed (spec 17.1: email and profile introduction never). */
const FORBIDDEN_KEYS = new Set([
  'email',
  'emailaddress',
  'introduction',
  'bemutatkozas',
  'bemutatkozás',
])

export const SEED_MAX_VIDEOS = 50

export class SeedValidationError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(
      `A seed JSON érvénytelen (${problems.length} probléma):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        '\nA várt formátumot lásd: docs/oob-inputs.md és docs/examples/seed.example.json',
    )
    this.name = 'SeedValidationError'
    this.problems = problems
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectForbiddenKeys(
  value: unknown,
  path: string,
  out: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectForbiddenKeys(item, `${path}[${index}]`, out),
    )
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      out.push(
        `${path}.${key}: tiltott mező — email és profilbemutatkozás nem kerülhet a seedbe (spec 17.1).`,
      )
    }
    collectForbiddenKeys(child, `${path}.${key}`, out)
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CONTENT_STATUSES = ['published', 'draft', 'archived'] as const
const VISIBILITIES = ['public', 'schonherz', 'bss'] as const

function optionalText(
  source: Record<string, unknown>,
  key: string,
  path: string,
  maxLength: number,
  problems: string[],
): string | null {
  const value = source[key]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    problems.push(`${path}.${key}: szöveg vagy null kell legyen.`)
    return null
  }
  if (value.length > maxLength) {
    problems.push(
      `${path}.${key}: legfeljebb ${maxLength} karakter lehet (jelenlegi hossz: ${value.length}).`,
    )
  }
  return value
}

function requiredText(
  source: Record<string, unknown>,
  key: string,
  path: string,
  maxLength: number,
  problems: string[],
): string {
  const value = source[key]
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${path}.${key}: kötelező, nem üres szövegmező.`)
    return ''
  }
  if (value.length > maxLength) {
    problems.push(
      `${path}.${key}: legfeljebb ${maxLength} karakter lehet (jelenlegi hossz: ${value.length}).`,
    )
  }
  return value
}

function enumValue<T extends string>(
  source: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
  defaultValue: T,
  problems: string[],
): T {
  const value = source[key]
  if (value === undefined || value === null) return defaultValue
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    problems.push(
      `${path}.${key}: érvénytelen érték "${String(value)}". Engedélyezett: ${allowed.join(', ')}.`,
    )
    return defaultValue
  }
  return value as T
}

function dateField(
  source: Record<string, unknown>,
  key: string,
  path: string,
  problems: string[],
): string | null {
  const value = source[key]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    problems.push(
      `${path}.${key}: éééé-hh-nn formátumú naptári dátum kell (kapott érték: "${String(value)}").`,
    )
    return null
  }
  return value
}

function mediaUrlField(
  source: Record<string, unknown>,
  key: string,
  path: string,
  kind: 'video' | 'thumbnail',
  mediaConfig: OobConfig['media'],
  problems: string[],
): string | null {
  const value = source[key]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim() === '') return null
  const shape = checkMediaUrlShape(value, kind, mediaConfig)
  if (!shape.ok) {
    for (const problem of shape.problems) {
      problems.push(`${path}.${key}: ${problem}`)
    }
  }
  return value
}

function validateEvent(
  raw: unknown,
  index: number,
  mediaConfig: OobConfig['media'],
  problems: string[],
): SeedEvent | null {
  const path = `events[${index}]`
  if (!isRecord(raw)) {
    problems.push(`${path}: objektum kell legyen.`)
    return null
  }
  const key = requiredText(raw, 'key', path, 200, problems)
  const title = requiredText(raw, 'title', path, TEXT_LIMITS.title, problems)

  let slug = slugify(key)
  const explicitSlug = raw['slug']
  if (explicitSlug !== undefined && explicitSlug !== null) {
    if (typeof explicitSlug !== 'string' || explicitSlug.trim() === '') {
      problems.push(`${path}.slug: nem üres szöveg vagy hiányzó mező kell.`)
    } else {
      slug = slugify(explicitSlug)
    }
  }

  const description = optionalText(
    raw,
    'description',
    path,
    TEXT_LIMITS.description,
    problems,
  )
  const thumbnailUrl = mediaUrlField(
    raw,
    'thumbnailUrl',
    path,
    'thumbnail',
    mediaConfig,
    problems,
  )
  const startDate = dateField(raw, 'startDate', path, problems)
  const endDate = dateField(raw, 'endDate', path, problems)
  if (startDate !== null && endDate !== null && endDate < startDate) {
    problems.push(`${path}: a befejezés nem lehet korábbi a kezdésnél.`)
  }
  const status = enumValue(
    raw,
    'status',
    path,
    CONTENT_STATUSES,
    'published',
    problems,
  )

  if (status === 'published' && startDate === null) {
    // The publishing rule (spec 6.1) applies here too: a start date is required for publishing.
    problems.push(`${path}: publikált eseménynél a startDate kötelező.`)
  }

  return {
    key,
    title,
    slug,
    description,
    thumbnailUrl,
    startDate,
    endDate,
    status,
  }
}

function validateVideo(
  raw: unknown,
  index: number,
  eventKeys: ReadonlySet<string>,
  declaredTags: ReadonlySet<string>,
  declaredRoles: ReadonlySet<string>,
  mediaConfig: OobConfig['media'],
  problems: string[],
): SeedVideo | null {
  const path = `videos[${index}]`
  if (!isRecord(raw)) {
    problems.push(`${path}: objektum kell legyen.`)
    return null
  }
  const key = requiredText(raw, 'key', path, 200, problems)
  const title = requiredText(raw, 'title', path, TEXT_LIMITS.title, problems)

  let slug = slugify(title)
  const explicitSlug = raw['slug']
  if (explicitSlug !== undefined && explicitSlug !== null) {
    if (typeof explicitSlug !== 'string' || explicitSlug.trim() === '') {
      problems.push(`${path}.slug: nem üres szöveg vagy hiányzó mező kell.`)
    } else {
      slug = slugify(explicitSlug)
    }
  }

  const description = optionalText(
    raw,
    'description',
    path,
    TEXT_LIMITS.description,
    problems,
  )
  const guests = optionalText(
    raw,
    'guests',
    path,
    TEXT_LIMITS.guestsOrSongs,
    problems,
  )
  const songs = optionalText(
    raw,
    'songs',
    path,
    TEXT_LIMITS.guestsOrSongs,
    problems,
  )
  const videoUrl = mediaUrlField(
    raw,
    'videoUrl',
    path,
    'video',
    mediaConfig,
    problems,
  )
  const thumbnailUrl = mediaUrlField(
    raw,
    'thumbnailUrl',
    path,
    'thumbnail',
    mediaConfig,
    problems,
  )
  const visibility = enumValue(
    raw,
    'visibility',
    path,
    VISIBILITIES,
    'public',
    problems,
  )
  const status = enumValue(
    raw,
    'status',
    path,
    CONTENT_STATUSES,
    'published',
    problems,
  )
  const recordedAt = dateField(raw, 'recordedAt', path, problems)

  let publishedAt: Date | null = null
  const publishedRaw = raw['publishedAt']
  if (publishedRaw !== undefined && publishedRaw !== null) {
    if (typeof publishedRaw !== 'string') {
      problems.push(`${path}.publishedAt: ISO időpont-szöveg kell.`)
    } else {
      const parsed = new Date(publishedRaw)
      if (Number.isNaN(parsed.getTime())) {
        problems.push(
          `${path}.publishedAt: érvénytelen ISO időpont ("${publishedRaw}").`,
        )
      } else {
        publishedAt = parsed
      }
    }
  }

  let eventKey: string | null = null
  const eventKeyRaw = raw['eventKey']
  if (eventKeyRaw !== undefined && eventKeyRaw !== null) {
    if (typeof eventKeyRaw !== 'string') {
      problems.push(`${path}.eventKey: szöveg kell.`)
    } else if (!eventKeys.has(eventKeyRaw)) {
      problems.push(
        `${path}.eventKey: ismeretlen eseménykulcs "${eventKeyRaw}" — vedd fel az events listába.`,
      )
    } else {
      eventKey = eventKeyRaw
    }
  }

  const tags: string[] = []
  if (raw['tags'] !== undefined && raw['tags'] !== null) {
    if (!Array.isArray(raw['tags'])) {
      problems.push(`${path}.tags: szövegek listája kell.`)
    } else {
      for (const tag of raw['tags']) {
        if (typeof tag !== 'string' || tag.trim() === '') {
          problems.push(`${path}.tags: minden elem nem üres szöveg kell.`)
          continue
        }
        if (!declaredTags.has(tag)) {
          problems.push(
            `${path}.tags: a "${tag}" címke nincs felvéve a tags listába.`,
          )
          continue
        }
        if (!tags.includes(tag)) tags.push(tag)
      }
    }
  }

  const staff: SeedStaffEntry[] = []
  if (raw['staff'] !== undefined && raw['staff'] !== null) {
    if (!Array.isArray(raw['staff'])) {
      problems.push(
        `${path}.staff: { username, role } objektumok listája kell.`,
      )
    } else {
      raw['staff'].forEach((entry, staffIndex) => {
        const entryPath = `${path}.staff[${staffIndex}]`
        if (!isRecord(entry)) {
          problems.push(`${entryPath}: objektum kell legyen (username, role).`)
          return
        }
        const username = requiredText(
          entry,
          'username',
          entryPath,
          200,
          problems,
        )
        const role = requiredText(
          entry,
          'role',
          entryPath,
          TEXT_LIMITS.tagOrRole,
          problems,
        )
        if (role !== '' && !declaredRoles.has(role)) {
          problems.push(
            `${entryPath}.role: a "${role}" szerep nincs felvéve a staffRoles listába.`,
          )
          return
        }
        if (username === '' || role === '') return
        if (staff.some((s) => s.username === username && s.role === role)) {
          return
        }
        staff.push({ username, role })
      })
    }
  }

  if (status === 'published') {
    if (videoUrl === null) {
      problems.push(`${path}: publikált videónál a videoUrl kötelező.`)
    }
    if (thumbnailUrl === null) {
      problems.push(`${path}: publikált videónál a thumbnailUrl kötelező.`)
    }
  }

  return {
    key,
    title,
    slug,
    description,
    guests,
    songs,
    videoUrl,
    thumbnailUrl,
    visibility,
    status,
    recordedAt,
    publishedAt,
    eventKey,
    tags,
    staff,
  }
}

/**
 * Structural and content validation of the scraper output, without network
 * calls. The errors are listed in Hungarian, with location placeholders.
 */
export function validateSeedJson(
  raw: unknown,
  mediaConfig: OobConfig['media'],
): SeedFile {
  const problems: string[] = []

  collectForbiddenKeys(raw, '', problems)

  if (!isRecord(raw)) {
    throw new SeedValidationError([
      'A seed gyökere objektum kell legyen (JSON).',
    ])
  }

  if (raw['version'] !== 1) {
    problems.push('version: a formátumverzió 1 kell legyen.')
  }

  const eventsRaw = raw['events']
  if (!Array.isArray(eventsRaw)) {
    problems.push('events: lista kell (üres is lehet).')
  }
  const tagsRaw = raw['tags']
  if (!Array.isArray(tagsRaw)) {
    problems.push('tags: szövegek listája kell.')
  }
  const rolesRaw = raw['staffRoles']
  if (!Array.isArray(rolesRaw)) {
    problems.push('staffRoles: szövegek listája kell.')
  }
  const videosRaw = raw['videos']
  if (!Array.isArray(videosRaw)) {
    problems.push('videos: lista kell.')
  } else if (videosRaw.length > SEED_MAX_VIDEOS) {
    problems.push(
      `videos: legfeljebb ${SEED_MAX_VIDEOS} videó tölthető be (spec 17.1), jelenlegi: ${videosRaw.length}.`,
    )
  }

  if (problems.length > 0) {
    throw new SeedValidationError(problems)
  }

  const tagNames: string[] = []
  for (const tag of tagsRaw as unknown[]) {
    if (typeof tag !== 'string' || tag.trim() === '') {
      problems.push('tags: minden elem nem üres szöveg kell legyen.')
      continue
    }
    if (tag.length > TEXT_LIMITS.tagOrRole) {
      problems.push(
        `tags: a "${tag}" címke legfeljebb ${TEXT_LIMITS.tagOrRole} karakter lehet.`,
      )
      continue
    }
    if (!tagNames.includes(tag)) tagNames.push(tag)
  }
  const roleNames: string[] = []
  for (const role of rolesRaw as unknown[]) {
    if (typeof role !== 'string' || role.trim() === '') {
      problems.push('staffRoles: minden elem nem üres szöveg kell legyen.')
      continue
    }
    if (role.length > TEXT_LIMITS.tagOrRole) {
      problems.push(
        `staffRoles: a "${role}" szerep legfeljebb ${TEXT_LIMITS.tagOrRole} karakter lehet.`,
      )
      continue
    }
    if (!roleNames.includes(role)) roleNames.push(role)
  }

  const declaredTags = new Set(tagNames)
  const declaredRoles = new Set(roleNames)

  const validatedEvents: SeedEvent[] = []
  const seenEventKeys = new Set<string>()
  const seenEventSlugs = new Set<string>()
  ;(eventsRaw as unknown[]).forEach((rawEvent, index) => {
    const event = validateEvent(rawEvent, index, mediaConfig, problems)
    if (event === null) return
    if (seenEventKeys.has(event.key)) {
      problems.push(`events[${index}]: duplikált kulcs "${event.key}".`)
    } else {
      seenEventKeys.add(event.key)
    }
    if (seenEventSlugs.has(event.slug)) {
      problems.push(
        `events[${index}]: a "${event.slug}" slug több eseményhez is tartozna.`,
      )
    } else {
      seenEventSlugs.add(event.slug)
    }
    validatedEvents.push(event)
  })

  const eventKeys = seenEventKeys

  const validatedVideos: SeedVideo[] = []
  const seenVideoKeys = new Set<string>()
  const seenVideoSlugs = new Set<string>()
  ;(videosRaw as unknown[]).forEach((rawVideo, index) => {
    const video = validateVideo(
      rawVideo,
      index,
      eventKeys,
      declaredTags,
      declaredRoles,
      mediaConfig,
      problems,
    )
    if (video === null) return
    if (seenVideoKeys.has(video.key)) {
      problems.push(`videos[${index}]: duplikált kulcs "${video.key}".`)
    } else {
      seenVideoKeys.add(video.key)
    }
    if (seenVideoSlugs.has(video.slug)) {
      problems.push(
        `videos[${index}]: a "${video.slug}" slug több videóhoz is tartozna.`,
      )
    } else {
      seenVideoSlugs.add(video.slug)
    }
    validatedVideos.push(video)
  })

  if (problems.length > 0) {
    throw new SeedValidationError(problems)
  }

  return {
    version: 1,
    events: validatedEvents,
    tags: tagNames,
    staffRoles: roleNames,
    videos: validatedVideos,
  }
}
