import { eq, inArray } from 'drizzle-orm'
import type { MediaConfig } from '#/server/media/validator.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import {
  events,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
} from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import {
  TEXT_LIMITS,
  TextValidationError,
  validatePlainText,
  validateRequiredText,
} from '#/server/shared/text.ts'
import {
  EntityNotFoundError,
  StaleWriteError,
  writeAudit,
} from '#/server/shared/write.ts'
import {
  checkMediaUrlShape,
  validateMediaForPublish,
} from '#/server/media/validator.ts'
import {
  findFreeSlug,
  renameSlugWithHistory,
  slugify,
} from '#/server/shared/slug.ts'
import { invalidateHomepageReferences } from './highlight-invalidation.ts'
import { VIDEO_ENCODING_GROUPS, videoAssetUrls } from '#/lib/video-media.ts'
import type { VideoEncodingGroup } from '#/lib/video-media.ts'

export type VideoVisibility = 'public' | 'schonherz' | 'bss'

const VISIBILITIES: ReadonlySet<string> = new Set([
  'public',
  'schonherz',
  'bss',
])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface VideoDeps {
  viewer: Viewer
  clock?: Clock
  mediaConfig: MediaConfig
  fetchImpl?: typeof fetch
}

export interface VideoInput {
  title?: string
  description?: string | null
  guests?: string | null
  songs?: string | null
  encodingGroup?: VideoEncodingGroup | null
  hasHq?: boolean
  hasLq?: boolean
  baseFilename?: string | null
  visibility?: VideoVisibility
  recordedAt?: string | null
  eventId?: string | null
  publishedAt?: Date | null
}

function assertContentEditor(viewer: Viewer): void {
  if (!can.createOrEditContent(viewer)) {
    throw new ForbiddenError(
      'Videót csak bejelentkezett BSS-tag hozhat létre vagy szerkeszthet.',
    )
  }
}

async function lockVideo(executor: Executor, videoId: string) {
  const rows = await executor
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .for('update')
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    throw new EntityNotFoundError('video', videoId)
  }
  return row
}

function validateDateField(
  fieldName: string,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value.trim() === '') {
    return null
  }
  if (!DATE_PATTERN.test(value)) {
    throw new TextValidationError([
      `${fieldName}: éééé-hh-nn formátumú naptári dátum kell (kapott érték: "${value}").`,
    ])
  }
  return value
}

function validatedChanges(input: VideoInput): Record<string, unknown> {
  const changes: Record<string, unknown> = {}

  if (input.title !== undefined) {
    changes.title = validateRequiredText('Cím', input.title, TEXT_LIMITS.title)
  }
  if (input.description !== undefined) {
    changes.description = validatePlainText(
      'Leírás',
      input.description,
      TEXT_LIMITS.description,
    )
  }
  if (input.guests !== undefined) {
    changes.guests = validatePlainText(
      'Vendégek',
      input.guests,
      TEXT_LIMITS.guestsOrSongs,
    )
  }
  if (input.songs !== undefined) {
    changes.songs = validatePlainText(
      'Felhasznált zenék',
      input.songs,
      TEXT_LIMITS.guestsOrSongs,
    )
  }
  if (input.encodingGroup !== undefined) {
    if (
      input.encodingGroup !== null &&
      !VIDEO_ENCODING_GROUPS.includes(input.encodingGroup)
    ) {
      throw new TextValidationError(['Érvénytelen videóprofil.'])
    }
    changes.encodingGroup = input.encodingGroup
  }
  if (input.hasHq !== undefined) changes.hasHq = input.hasHq
  if (input.hasLq !== undefined) changes.hasLq = input.hasLq
  if (input.baseFilename !== undefined) {
    const trimmed = input.baseFilename?.trim() ?? ''
    if (trimmed !== '') {
      validatePlainText('Alapfájlnév', trimmed, 255)
      if (/[\\/]/.test(trimmed)) {
        throw new TextValidationError([
          'Alapfájlnév: könyvtárnév és perjel nem adható meg.',
        ])
      }
    }
    changes.baseFilename = trimmed === '' ? null : trimmed
  }
  if (input.visibility !== undefined) {
    if (!VISIBILITIES.has(input.visibility)) {
      throw new TextValidationError([
        `Érvénytelen láthatóság: ${String(input.visibility)}.`,
      ])
    }
    changes.visibility = input.visibility
  }
  if (input.recordedAt !== undefined) {
    changes.recordedAt = validateDateField('Készült dátuma', input.recordedAt)
  }

  return changes
}

function eventRangeWarning(
  event: typeof events.$inferSelect,
  recordedAt: string,
): string[] {
  if (event.startDate === null) {
    return []
  }
  const start = event.startDate
  const end = event.endDate ?? start
  if (recordedAt >= start && recordedAt <= end) {
    return []
  }
  const range = end !== start ? `${start}–${end}` : start
  return [
    `A videó készülési dátuma (${recordedAt}) az esemény időtartamán (${range}) kívül van.`,
  ]
}

async function loadEventOrNull(executor: Executor, eventId: string | null) {
  if (eventId === null) {
    return null
  }
  const rows = await executor
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)
  return rows.at(0) ?? null
}

async function applyEventAssignment(
  tx: Executor,
  currentRecordedAt: string | null,
  newEventId: string | null,
): Promise<{ recordedAt: string | null; warnings: string[] }> {
  const event = await loadEventOrNull(tx, newEventId)
  if (event === null) {
    if (newEventId !== null) {
      throw new TextValidationError(['Az esemény nem található.'])
    }
    // Detach: the `recordedAt` is preserved.
    return { recordedAt: currentRecordedAt, warnings: [] }
  }

  let recordedAt = currentRecordedAt
  const warnings: string[] = []
  if (
    event.startDate !== null &&
    event.endDate === null &&
    recordedAt === null
  ) {
    // One-day event: silent automatic fill-in.
    recordedAt = event.startDate
  }
  if (
    event.startDate !== null &&
    event.endDate !== null &&
    recordedAt === null
  ) {
    warnings.push(
      'Többnapos eseményhez publikálás előtt meg kell adni a videó készülési dátumát.',
    )
  }
  if (recordedAt !== null) {
    warnings.push(...eventRangeWarning(event, recordedAt))
  }
  return { recordedAt, warnings }
}

export async function createVideoDraft(
  executor: Executor,
  deps: VideoDeps,
  input: VideoInput & { slug?: string },
): Promise<typeof videos.$inferSelect> {
  assertContentEditor(deps.viewer)

  return executor.transaction(async (tx) => {
    const title = validateRequiredText('Cím', input.title, TEXT_LIMITS.title)
    const slugBase = input.slug ?? title
    const slug = await findFreeSlug(tx, 'video', slugify(slugBase))

    // The other draft fields can also be given at creation time (even an
    // invalid media URL can be saved — publishing validates it).
    const changes = validatedChanges({ ...input, title })

    const inserted = await tx
      .insert(videos)
      .values({
        slug,
        title,
        description: (changes.description as string | null) ?? null,
        guests: (changes.guests as string | null) ?? null,
        songs: (changes.songs as string | null) ?? null,
        encodingGroup:
          (changes.encodingGroup as VideoEncodingGroup | null) ?? null,
        hasHq: (changes.hasHq as boolean | undefined) ?? false,
        hasLq: (changes.hasLq as boolean | undefined) ?? false,
        baseFilename: (changes.baseFilename as string | null) ?? null,
        recordedAt: (changes.recordedAt as string | null) ?? null,
        visibility: 'public',
        status: 'draft',
        createdBy: deps.viewer.sub,
        updatedBy: deps.viewer.sub,
      })
      .returning()
    const row = inserted.at(0)
    if (row === undefined) {
      throw new Error('A videó piszkozat létrehozása nem sikerült.')
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: row.id,
      action: 'create',
      before: null,
      after: snapshotVideo(row),
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
}

export interface UpdateVideoResult {
  row: typeof videos.$inferSelect
  warnings: string[]
}

export async function updateVideo(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
  input: VideoInput & { slug?: string },
): Promise<UpdateVideoResult> {
  assertContentEditor(deps.viewer)

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }

    const changes = validatedChanges(input)
    const warnings: string[] = []

    if (input.eventId !== undefined) {
      const explicitRecordedAt =
        input.recordedAt !== undefined
          ? (changes.recordedAt as string | null)
          : undefined
      const effectiveCurrent =
        explicitRecordedAt !== undefined
          ? explicitRecordedAt
          : locked.recordedAt
      const assignment = await applyEventAssignment(
        tx,
        effectiveCurrent,
        input.eventId,
      )
      changes.eventId = input.eventId
      if (explicitRecordedAt === undefined) {
        // Silent fill-in only for an empty field; an existing value is never overwritten.
        changes.recordedAt = assignment.recordedAt
        warnings.push(
          ...assignment.warnings.filter((w) => w.includes('időtartamán')),
        )
      } else {
        changes.recordedAt = explicitRecordedAt
        const event = await loadEventOrNull(tx, input.eventId)
        if (event !== null && explicitRecordedAt !== null) {
          warnings.push(...eventRangeWarning(event, explicitRecordedAt))
        }
      }
    } else if (input.recordedAt !== undefined) {
      // A standalone date change also warns when an existing event is attached.
      const event = await loadEventOrNull(tx, locked.eventId)
      const newDate = changes.recordedAt as string | null
      if (event !== null && newDate !== null) {
        warnings.push(...eventRangeWarning(event, newDate))
      }
    }

    if (input.publishedAt !== undefined) {
      const publishedAt = input.publishedAt
      if (
        publishedAt !== null &&
        publishedAt.getTime() > (deps.clock ?? systemClock).now().getTime()
      ) {
        throw new TextValidationError([
          'A feltöltés dátuma nem lehet jövőbeli időpont.',
        ])
      }
      changes.publishedAt = publishedAt
    }

    if (input.slug !== undefined) {
      const nextSlug = await renameSlugWithHistory(tx, {
        entityType: 'video',
        entityId: videoId,
        currentSlug: locked.slug,
        newSlugBase: slugify(input.slug),
        now: (deps.clock ?? systemClock).now(),
      })
      changes.slug = nextSlug
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(videos)
      .set({
        ...changes,
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    // When narrowing visibility, the highlight and About list are invalidated here as well.
    if (row.visibility !== 'public') {
      await invalidateHomepageReferences(tx, videoId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'update',
      before: snapshotVideo(locked),
      after: snapshotVideo(row),
      occurredAt: now,
    })
    return { row, warnings }
  })
}

interface PublishPreconditions {
  problems: string[]
  multiDayEventRequiresDate: boolean
}

function publishPreconditions(
  row: typeof videos.$inferSelect,
): PublishPreconditions {
  const problems: string[] = []
  if (row.title.trim() === '') problems.push('Cím: kötelező mező.')
  if (row.encodingGroup === null) {
    problems.push('Videóprofil: publikáláshoz kötelező.')
  }
  if (!row.hasHq && !row.hasLq) {
    problems.push('Legalább egy videóminőség kötelező a publikáláshoz.')
  }
  if (row.baseFilename === null || row.baseFilename === '') {
    problems.push('Alapfájlnév: publikáláshoz kötelező.')
  }

  return {
    problems,
    multiDayEventRequiresDate: row.recordedAt === null || row.recordedAt === '',
  }
}

export async function publishVideo(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
): Promise<UpdateVideoResult> {
  assertContentEditor(deps.viewer)

  const preloadedRows = await executor
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)
  const preloaded = preloadedRows.at(0)
  if (preloaded === undefined) {
    throw new EntityNotFoundError('video', videoId)
  }

  const preconditions = publishPreconditions(preloaded)
  if (preconditions.problems.length > 0) {
    throw new TextValidationError(preconditions.problems)
  }

  // Multi-day event `recordedAt` requirement:
  const event = await loadEventOrNull(executor, preloaded.eventId)
  const multiDay = event !== null && event.endDate !== null
  if (
    multiDay &&
    (preloaded.recordedAt === null || preloaded.recordedAt === '')
  ) {
    throw new TextValidationError([
      'Többnapos eseményhez publikálás előtt meg kell adni a készülési dátumot.',
    ])
  }

  const mediaUrls = videoAssetUrls(preloaded)
  const mediaToValidate = [
    { kind: 'video' as const, url: mediaUrls.hqUrl },
    { kind: 'video' as const, url: mediaUrls.lqUrl },
    { kind: 'thumbnail' as const, url: mediaUrls.thumbnailUrl },
  ]
  for (const { kind, url } of mediaToValidate) {
    if (url === null) continue
    const shape = checkMediaUrlShape(url, kind, deps.mediaConfig)
    if (!shape.ok) {
      throw new TextValidationError(shape.problems)
    }
    const result = await validateMediaForPublish({
      url,
      kind,
      mediaConfig: deps.mediaConfig,
      fetchImpl: deps.fetchImpl,
    })
    if (!result.ok) {
      throw new TextValidationError(result.problems)
    }
  }

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }
    if (locked.status === 'trash') {
      throw new TextValidationError([
        'Lomtárban lévő videót csak visszaállítás után lehet publikálni.',
      ])
    }

    const now = (deps.clock ?? systemClock).now()
    const publishedAt =
      locked.publishedAt !== null &&
      locked.publishedAt.getTime() <= now.getTime()
        ? locked.publishedAt
        : now

    const updated = await tx
      .update(videos)
      .set({
        status: 'published',
        publishedAt,
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'publish',
      before: snapshotVideo(locked),
      after: snapshotVideo(row),
      occurredAt: now,
    })

    const warnings: string[] = []
    if (event !== null && row.recordedAt !== null) {
      warnings.push(...eventRangeWarning(event, row.recordedAt))
    }
    return { row, warnings }
  })
}

export async function archiveVideo(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
): Promise<UpdateVideoResult> {
  assertContentEditor(deps.viewer)

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }
    if (locked.status === 'trash') {
      throw new TextValidationError([
        'Lomtárban lévő videó nem archiválható közvetlenül; előbb vezetőségnek vissza kell állítania.',
      ])
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(videos)
      .set({
        status: 'archived',
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    // Archived content is removed from the highlight and the About list.
    await invalidateHomepageReferences(tx, videoId)

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'archive',
      before: snapshotVideo(locked),
      after: snapshotVideo(row),
      occurredAt: now,
    })
    return { row, warnings: [] }
  })
}

export async function trashVideo(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
): Promise<UpdateVideoResult> {
  assertContentEditor(deps.viewer)

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(videos)
      .set({
        status: 'trash',
        trashedAt: now,
        trashedBy: deps.viewer.sub,
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    await invalidateHomepageReferences(tx, videoId)

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'trash',
      before: snapshotVideo(locked),
      after: snapshotVideo(row),
      occurredAt: now,
    })
    return { row, warnings: [] }
  })
}

export async function restoreVideoFromTrash(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
): Promise<UpdateVideoResult> {
  if (!can.restoreVideo(deps.viewer)) {
    throw new ForbiddenError('A lomtárból való visszaállítás vezetőségi jog.')
  }

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }
    if (locked.status !== 'trash') {
      throw new TextValidationError([
        'Csak lomtárban lévő videó állítható vissza.',
      ])
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(videos)
      .set({
        status: 'archived',
        trashedAt: null,
        trashedBy: null,
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'restore',
      before: snapshotVideo(locked),
      after: snapshotVideo(row),
      occurredAt: now,
    })
    return { row, warnings: [] }
  })
}

/** Replace the full tag list on a video (only existing tags can be assigned). */
export async function setVideoTags(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
  tagIds: readonly string[],
): Promise<{ row: typeof videos.$inferSelect }> {
  if (!can.assignExistingTagToVideo(deps.viewer)) {
    throw new ForbiddenError(
      'Címkét csak bejelentkezett BSS-tag rendelhet videóhoz.',
    )
  }

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }

    const uniqueIds = [...new Set(tagIds)]
    if (uniqueIds.length > 0) {
      const existing = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.id, uniqueIds))
      if (existing.length !== uniqueIds.length) {
        throw new TextValidationError([
          'Csak meglévő címke rendelhető videóhoz (ismeretlen címkék szerepelnek a listában).',
        ])
      }
    }

    const beforeList = (
      await tx
        .select({ id: videoTags.tagId })
        .from(videoTags)
        .where(eq(videoTags.videoId, videoId))
    ).map((r) => r.id)
    await tx.delete(videoTags).where(eq(videoTags.videoId, videoId))
    if (uniqueIds.length > 0) {
      await tx
        .insert(videoTags)
        .values(uniqueIds.map((tagId) => ({ videoId, tagId })))
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(videos)
      .set({
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'assign_tags',
      before: { tagIds: beforeList },
      after: { tagIds: uniqueIds },
      occurredAt: now,
    })
    return { row }
  })
}

export interface StaffAssignment {
  roleId: string
  memberSub: string
}

/** Replace the staff list on a video: one role with several members, one member with several roles. */
export async function setVideoStaff(
  executor: Executor,
  deps: VideoDeps,
  videoId: string,
  expectedVersion: number,
  assignments: readonly StaffAssignment[],
): Promise<{ row: typeof videos.$inferSelect }> {
  if (!can.manageVideoStaffList(deps.viewer)) {
    throw new ForbiddenError(
      'A stáblista kezelése csak bejelentkezett BSS-tagnek engedélyezett.',
    )
  }

  return executor.transaction(async (tx) => {
    const locked = await lockVideo(tx, videoId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('videó')
    }

    const roleIds = [...new Set(assignments.map((a) => a.roleId))]
    if (roleIds.length > 0) {
      const existingRoles = await tx
        .select({ id: staffRoles.id })
        .from(staffRoles)
        .where(inArray(staffRoles.id, roleIds))
      if (existingRoles.length !== roleIds.length) {
        throw new TextValidationError([
          'Ismeretlen stábszerep szerepel a listában.',
        ])
      }
    }

    const deduped: StaffAssignment[] = []
    for (const assignment of assignments) {
      if (
        !deduped.some(
          (a) =>
            a.roleId === assignment.roleId &&
            a.memberSub === assignment.memberSub,
        )
      ) {
        deduped.push(assignment)
      }
    }

    const beforeList = await tx
      .select({ roleId: videoStaff.roleId, memberSub: videoStaff.memberSub })
      .from(videoStaff)
      .where(eq(videoStaff.videoId, videoId))

    await tx.delete(videoStaff).where(eq(videoStaff.videoId, videoId))
    if (deduped.length > 0) {
      await tx.insert(videoStaff).values(
        deduped.map((a) => ({
          videoId,
          roleId: a.roleId,
          memberSub: a.memberSub,
        })),
      )
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(videos)
      .set({
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(videos.id, videoId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('video', videoId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'video',
      entityId: videoId,
      action: 'assign_staff',
      before: { staff: beforeList },
      after: { staff: deduped },
      occurredAt: now,
    })
    return { row }
  })
}

function snapshotVideo(
  row: typeof videos.$inferSelect,
): Record<string, unknown> {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    guests: row.guests,
    songs: row.songs,
    encodingGroup: row.encodingGroup,
    hasHq: row.hasHq,
    hasLq: row.hasLq,
    baseFilename: row.baseFilename,
    visibility: row.visibility,
    status: row.status,
    eventId: row.eventId,
    recordedAt: row.recordedAt,
    publishedAt:
      row.publishedAt instanceof Date
        ? row.publishedAt.toISOString()
        : row.publishedAt,
    viewCount: row.viewCount,
    version: row.version,
  }
}
