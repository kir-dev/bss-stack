import { eq, inArray } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import {
  events,
  memberCache,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
} from '#/db/schema.ts'
import { normalizeCatalogName } from '#/server/catalog/names.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { SYSTEM_ACTOR, writeAudit } from '#/server/shared/write.ts'
import type { SeedFile } from './schema.ts'

export class SeedImportError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(
      `A seed betöltése nem sikerült (${problems.length} probléma):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    )
    this.name = 'SeedImportError'
    this.problems = problems
  }
}

export interface SeedImportResult {
  createdEvents: number
  updatedEvents: number
  createdTags: number
  createdStaffRoles: number
  createdVideos: number
  updatedVideos: number
  tagLinks: number
  staffLinks: number
}

interface ImportParams {
  seed: SeedFile
  clock?: Clock
}

function jsonStable(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function valuesDiffer(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return Object.keys(after).some(
    (key) => jsonStable(before[key]) !== jsonStable(after[key]),
  )
}

async function resolveMemberSubs(
  executor: Executor,
  usernames: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(usernames)]
  if (unique.length === 0) return new Map()
  const rows = await executor
    .select({ sub: memberCache.sub, username: memberCache.username })
    .from(memberCache)
    .where(inArray(memberCache.username, unique))
  const map = new Map(rows.map((row) => [row.username, row.sub]))
  const missing = unique.filter((username) => !map.has(username))
  if (missing.length > 0) {
    throw new SeedImportError([
      `A következő stábtag-felhasználók nem találhatók a tagcache-ben: ${missing.join(', ')}. ` +
        'A seed stáblistája a lokális Authentik bootstrap tesztprofiljaira mutat; ' +
        'futtasd le a tagcache-szinkront (alkalmazásindítás vagy kézi szinkron az /admin/members oldalon), mielőtt a seedet betöltöd.',
    ])
  }
  return map
}

export async function importSeed(
  executor: Executor,
  params: ImportParams,
): Promise<SeedImportResult> {
  const clock = params.clock ?? systemClock

  const allUsernames = params.seed.videos.flatMap((video) =>
    video.staff.map((entry) => entry.username),
  )

  return executor.transaction(async (tx) => {
    const subByUsername = await resolveMemberSubs(tx, allUsernames)

    let createdEvents = 0
    let updatedEvents = 0
    let createdTags = 0
    let createdStaffRoles = 0
    let createdVideos = 0
    let updatedVideos = 0

    // --- Events: natural key is the slug ---
    const eventIdByKey = new Map<string, string>()
    for (const seedEvent of params.seed.events) {
      const existingRows = await tx
        .select()
        .from(events)
        .where(eq(events.slug, seedEvent.slug))
        .limit(1)
      const existing = existingRows.at(0)

      if (existing === undefined) {
        const inserted = await tx
          .insert(events)
          .values({
            slug: seedEvent.slug,
            title: seedEvent.title,
            description: seedEvent.description,
            thumbnailUrl: seedEvent.thumbnailUrl,
            startDate: seedEvent.startDate,
            endDate: seedEvent.endDate,
            status: seedEvent.status,
          })
          .returning()
        const row = inserted.at(0)
        if (row === undefined) {
          throw new Error(`Az esemény beszúrása nem sikerült: ${seedEvent.key}`)
        }
        eventIdByKey.set(seedEvent.key, row.id)
        createdEvents += 1
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          entityType: 'event',
          entityId: row.id,
          action: 'create',
          before: null,
          after: { slug: row.slug, title: row.title, source: 'seed' },
          occurredAt: clock.now(),
        })
        continue
      }

      eventIdByKey.set(seedEvent.key, existing.id)
      const changes = {
        title: seedEvent.title,
        description: seedEvent.description,
        thumbnailUrl: seedEvent.thumbnailUrl,
        startDate: seedEvent.startDate,
        endDate: seedEvent.endDate,
        status: seedEvent.status,
      }
      const before = existing as unknown as Record<string, unknown>
      if (valuesDiffer(before, changes)) {
        await tx
          .update(events)
          .set({
            ...changes,
            version: existing.version + 1,
            updatedAt: clock.now(),
            updatedBy: null,
          })
          .where(eq(events.id, existing.id))
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          entityType: 'event',
          entityId: existing.id,
          action: 'update',
          before: { source: 'seed', title: existing.title },
          after: { source: 'seed', ...changes },
          occurredAt: clock.now(),
        })
        updatedEvents += 1
      }
    }

    // --- Tags and staff roles: natural key is the normalized name ---
    for (const tagName of params.seed.tags) {
      const normalized = normalizeCatalogName(tagName)
      const rows = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.normalizedName, normalized))
        .limit(1)
      if (rows.length === 0) {
        await tx
          .insert(tags)
          .values({ name: tagName, normalizedName: normalized })
        createdTags += 1
      }
    }

    for (const [index, roleName] of params.seed.staffRoles.entries()) {
      const normalized = normalizeCatalogName(roleName)
      const rows = await tx
        .select({ id: staffRoles.id })
        .from(staffRoles)
        .where(eq(staffRoles.normalizedName, normalized))
        .limit(1)
      if (rows.length === 0) {
        await tx.insert(staffRoles).values({
          name: roleName,
          normalizedName: normalized,
          displayOrder: index,
        })
        createdStaffRoles += 1
      }
    }

    const tagIdByNormalizedName = new Map<string, string>()
    const wantedTagNames = params.seed.tags.map(normalizeCatalogName)
    if (wantedTagNames.length > 0) {
      const rows = await tx
        .select({ id: tags.id, normalizedName: tags.normalizedName })
        .from(tags)
      for (const row of rows) {
        if (wantedTagNames.includes(row.normalizedName)) {
          tagIdByNormalizedName.set(row.normalizedName, row.id)
        }
      }
    }

    const roleIdByNormalizedName = new Map<string, string>()
    const wantedRoleNames = params.seed.staffRoles.map(normalizeCatalogName)
    if (wantedRoleNames.length > 0) {
      const rows = await tx
        .select({
          id: staffRoles.id,
          normalizedName: staffRoles.normalizedName,
        })
        .from(staffRoles)
      for (const row of rows) {
        if (wantedRoleNames.includes(row.normalizedName)) {
          roleIdByNormalizedName.set(row.normalizedName, row.id)
        }
      }
    }

    // --- Videos: natural key is the slug; relations are deterministic ---
    for (const seedVideo of params.seed.videos) {
      const existingRows = await tx
        .select()
        .from(videos)
        .where(eq(videos.slug, seedVideo.slug))
        .limit(1)
      const existing = existingRows.at(0)

      const desiredBase = {
        title: seedVideo.title,
        description: seedVideo.description,
        guests: seedVideo.guests,
        songs: seedVideo.songs,
        encodingGroup: seedVideo.encodingGroup,
        hasHq: seedVideo.hasHq,
        hasLq: seedVideo.hasLq,
        baseFilename: seedVideo.baseFilename,
        visibility: seedVideo.visibility,
        status: seedVideo.status,
        eventId:
          seedVideo.eventKey === null
            ? null
            : (eventIdByKey.get(seedVideo.eventKey) ?? null),
        recordedAt: seedVideo.recordedAt,
      }

      // Resolve the desired relation set.
      const problems: string[] = []
      const resolvedTagIds = seedVideo.tags.map((tagName) => {
        const id = tagIdByNormalizedName.get(normalizeCatalogName(tagName))
        if (id === undefined) {
          problems.push(`A "${tagName}" címke nem oldható fel.`)
        }
        return id
      })
      const resolvedStaff = seedVideo.staff.map((entry) => {
        const sub = subByUsername.get(entry.username)
        const roleId = roleIdByNormalizedName.get(
          normalizeCatalogName(entry.role),
        )
        if (sub === undefined || roleId === undefined) {
          problems.push(
            `Ismeretlen stábtag vagy szerep: ${entry.username} / ${entry.role}`,
          )
          return null
        }
        return { roleId, memberSub: sub }
      })
      if (problems.length > 0) {
        throw new SeedImportError(problems)
      }
      const desiredTagIds: string[] = resolvedTagIds.filter(
        (id): id is string => id !== undefined,
      )
      const desiredStaff = resolvedStaff.filter(
        (entry): entry is { roleId: string; memberSub: string } =>
          entry !== null,
      )

      if (existing === undefined) {
        const publishedAt =
          seedVideo.publishedAt ??
          (seedVideo.status === 'published' ? clock.now() : null)
        const inserted = await tx
          .insert(videos)
          .values({ slug: seedVideo.slug, ...desiredBase, publishedAt })
          .returning()
        const row = inserted.at(0)
        if (row === undefined) {
          throw new Error(`A videó beszúrása nem sikerült: ${seedVideo.key}`)
        }
        createdVideos += 1
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          entityType: 'video',
          entityId: row.id,
          action: 'create',
          before: null,
          after: { slug: row.slug, title: row.title, source: 'seed' },
          occurredAt: clock.now(),
        })
        if (desiredTagIds.length > 0) {
          await tx
            .insert(videoTags)
            .values(desiredTagIds.map((tagId) => ({ videoId: row.id, tagId })))
        }
        if (desiredStaff.length > 0) {
          await tx
            .insert(videoStaff)
            .values(
              desiredStaff.map((entry) => ({ videoId: row.id, ...entry })),
            )
        }
        continue
      } else {
        const desired = {
          ...desiredBase,
          publishedAt:
            seedVideo.publishedAt !== null
              ? seedVideo.publishedAt.toISOString()
              : (existing.publishedAt?.toISOString() ?? null),
        }
        const before = existing as unknown as Record<string, unknown>
        if (valuesDiffer(before, desired)) {
          await tx
            .update(videos)
            .set({
              ...desiredBase,
              publishedAt: seedVideo.publishedAt ?? existing.publishedAt,
              version: existing.version + 1,
              updatedAt: clock.now(),
              updatedBy: null,
            })
            .where(eq(videos.id, existing.id))
          await writeAudit(tx, {
            actor: SYSTEM_ACTOR,
            entityType: 'video',
            entityId: existing.id,
            action: 'update',
            before: { source: 'seed', title: existing.title },
            after: { source: 'seed', title: seedVideo.title },
            occurredAt: clock.now(),
          })
          updatedVideos += 1
        }
      }

      // Relations are written only when they differ from the desired state
      // (the create branch exits with `continue`, so existing always exists here).
      const targetId = existing.id
      const currentTagIds = (
        await tx
          .select({ tagId: videoTags.tagId })
          .from(videoTags)
          .where(eq(videoTags.videoId, targetId))
      ).map((row) => row.tagId)
      const currentStaff = await tx
        .select({ roleId: videoStaff.roleId, memberSub: videoStaff.memberSub })
        .from(videoStaff)
        .where(eq(videoStaff.videoId, targetId))

      const tagsDiffer =
        [...currentTagIds].sort().join(',') !==
        [...desiredTagIds].sort().join(',')
      const staffDiffer =
        currentStaff.length !== desiredStaff.length ||
        desiredStaff.some(
          (desiredEntry) =>
            !currentStaff.some(
              (currentEntry) =>
                currentEntry.roleId === desiredEntry.roleId &&
                currentEntry.memberSub === desiredEntry.memberSub,
            ),
        )

      if (tagsDiffer) {
        await tx.delete(videoTags).where(eq(videoTags.videoId, targetId))
        if (desiredTagIds.length > 0) {
          await tx
            .insert(videoTags)
            .values(
              desiredTagIds.map((tagId) => ({ videoId: targetId, tagId })),
            )
        }
      }
      if (staffDiffer) {
        await tx.delete(videoStaff).where(eq(videoStaff.videoId, targetId))
        if (desiredStaff.length > 0) {
          await tx
            .insert(videoStaff)
            .values(
              desiredStaff.map((entry) => ({ videoId: targetId, ...entry })),
            )
        }
      }
    }

    const tagLinkRows = await tx
      .select({ videoId: videoTags.videoId })
      .from(videoTags)
    const staffLinkRows = await tx
      .select({ videoId: videoStaff.videoId })
      .from(videoStaff)

    return {
      createdEvents,
      updatedEvents,
      createdTags,
      createdStaffRoles,
      createdVideos,
      updatedVideos,
      tagLinks: tagLinkRows.length,
      staffLinks: staffLinkRows.length,
    }
  })
}
