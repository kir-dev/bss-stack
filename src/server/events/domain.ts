import { desc, eq, sql } from 'drizzle-orm'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { events, slugHistory, videos } from '#/db/schema.ts'
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

export class EventConfirmationError extends Error {
  constructor(title: string) {
    super(
      `A végleges törlés megerősítéséhez az esemény címét kell beírni: „${title}".`,
    )
    this.name = 'EventConfirmationError'
  }
}

export interface EventDeps {
  viewer: Viewer
  clock?: Clock
  mediaConfig: OobConfig['media']
  fetchImpl?: typeof fetch
}

export interface EventInput {
  title?: string
  description?: string | null
  thumbnailUrl?: string | null
  startDate?: string | null
  endDate?: string | null
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function assertContentEditor(viewer: Viewer): void {
  if (!can.createOrEditContent(viewer)) {
    throw new ForbiddenError(
      'Eseményt csak bejelentkezett BSS-tag hozhat létre vagy szerkeszthet.',
    )
  }
}

async function loadEvent(executor: Executor, eventId: string) {
  const rows = await executor
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    throw new EntityNotFoundError('event', eventId)
  }
  return row
}

function validateDateField(
  fieldName: string,
  value: string | null | undefined,
  options: { required?: boolean } = {},
): string | null {
  if (value === null || value === undefined || value.trim() === '') {
    if (options.required) {
      throw new TextValidationError([`${fieldName}: kötelező mező.`])
    }
    return null
  }
  if (!DATE_PATTERN.test(value)) {
    throw new TextValidationError([
      `${fieldName}: éééé-hh-nn formátumú naptári dátum kell (kapott érték: "${value}").`,
    ])
  }
  return value
}

/**
 * Validate fields against the current row: for partial updates the
 * end >= start relation applies to the merged state.
 */
function validatedChanges(
  current: Pick<typeof events.$inferSelect, 'startDate' | 'endDate'>,
  input: EventInput,
  mediaConfig: OobConfig['media'],
): Record<string, unknown> {
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

  const startDate =
    input.startDate !== undefined
      ? validateDateField('Kezdődátum', input.startDate)
      : current.startDate
  const endDate =
    input.endDate !== undefined
      ? validateDateField('Befejezés dátuma', input.endDate)
      : current.endDate

  if (input.startDate !== undefined) changes.startDate = startDate
  if (input.endDate !== undefined) changes.endDate = endDate

  if (endDate !== null && startDate !== null && endDate < startDate) {
    throw new TextValidationError([
      `A befejezés nem lehet korábbi a kezdésnél (${startDate} > ${endDate}).`,
    ])
  }

  if (input.thumbnailUrl !== undefined) {
    const trimmed = input.thumbnailUrl?.trim() ?? ''
    if (trimmed === '') {
      changes.thumbnailUrl = null
    } else {
      validatePlainText('Thumbnail URL', trimmed, TEXT_LIMITS.url)
      const shape = checkMediaUrlShape(trimmed, 'thumbnail', mediaConfig)
      if (!shape.ok) {
        throw new TextValidationError(shape.problems)
      }
      changes.thumbnailUrl = trimmed
    }
  }

  return changes
}

function assertPublishable(row: typeof events.$inferSelect): void {
  const problems: string[] = []
  if (row.title.trim() === '') {
    problems.push('Cím: kötelező mező.')
  }
  if (row.startDate === null || row.startDate === '') {
    problems.push('Kezdődátum: publikáláshoz kötelező megadni.')
  }
  if (problems.length > 0) {
    throw new TextValidationError(problems)
  }
}

/** Network validation of the existing thumbnail at publish time (bad media blocks). */
async function assertThumbnailReachable(
  row: typeof events.$inferSelect,
  deps: EventDeps,
): Promise<void> {
  if (row.thumbnailUrl === null || row.thumbnailUrl === '') {
    return
  }
  const result = await validateMediaForPublish({
    url: row.thumbnailUrl,
    kind: 'thumbnail',
    mediaConfig: deps.mediaConfig,
    fetchImpl: deps.fetchImpl,
  })
  if (!result.ok) {
    throw new TextValidationError(result.problems)
  }
}

export async function createEvent(
  executor: Executor,
  deps: EventDeps,
  input: EventInput & { slug?: string },
): Promise<typeof events.$inferSelect> {
  assertContentEditor(deps.viewer)

  return executor.transaction(async (tx) => {

    const title = validateRequiredText('Cím', input.title, TEXT_LIMITS.title)
    const emptyCurrent = {
      startDate: null as string | null,
      endDate: null as string | null,
    }
    const changes = validatedChanges(
      emptyCurrent,
      { ...input, title },
      deps.mediaConfig,
    )
    const slugBase = input.slug ?? title
    const slug = await findFreeSlug(tx, 'event', slugify(slugBase))

    const inserted = await tx
      .insert(events)
      .values({
        slug,
        title,
        description: (changes.description as string | null) ?? null,
        thumbnailUrl: (changes.thumbnailUrl as string | null) ?? null,
        startDate: (changes.startDate as string | null) ?? null,
        endDate: (changes.endDate as string | null) ?? null,
        status: 'draft',
        createdBy: deps.viewer.sub,
        updatedBy: deps.viewer.sub,
      })
      .returning()
    const row = inserted.at(0)
    if (row === undefined) {
      throw new Error('Az esemény létrehozása nem sikerült.')
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'event',
      entityId: row.id,
      action: 'create',
      before: null,
      after: snapshotEvent(row),
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
}

export interface UpdateEventParams extends EventInput {
  /** Explicit slug change; with redirect history. */
  slug?: string
}

export async function updateEvent(
  executor: Executor,
  deps: EventDeps,
  eventId: string,
  expectedVersion: number,
  input: UpdateEventParams,
): Promise<typeof events.$inferSelect> {
  assertContentEditor(deps.viewer)

  return executor.transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('esemény')
    }

    const changes = validatedChanges(locked, input, deps.mediaConfig)
    let nextSlug = locked.slug
    if (input.slug !== undefined) {
      nextSlug = await renameSlugWithHistory(tx, {
        entityType: 'event',
        entityId: eventId,
        currentSlug: locked.slug,
        newSlugBase: slugify(input.slug),
        now: (deps.clock ?? systemClock).now(),
      })
      changes.slug = nextSlug
    }

    const updated = await tx
      .update(events)
      .set({
        ...changes,
        version: locked.version + 1,
        updatedAt: (deps.clock ?? systemClock).now(),
        updatedBy: deps.viewer.sub,
      })
      .where(eq(events.id, eventId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('event', eventId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'event',
      entityId: eventId,
      action: 'update',
      before: snapshotEvent(locked),
      after: snapshotEvent(row),
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
}

export async function publishEvent(
  executor: Executor,
  deps: EventDeps,
  eventId: string,
  expectedVersion: number,
): Promise<typeof events.$inferSelect> {
  assertContentEditor(deps.viewer)

  const current = await loadEvent(executor, eventId)
  assertPublishable(current)
  await assertThumbnailReachable(current, deps)

  return transitionEventStatus(
    executor,
    deps,
    eventId,
    expectedVersion,
    'published',
  )
}

export async function archiveEvent(
  executor: Executor,
  deps: EventDeps,
  eventId: string,
  expectedVersion: number,
): Promise<typeof events.$inferSelect> {
  assertContentEditor(deps.viewer)
  return transitionEventStatus(
    executor,
    deps,
    eventId,
    expectedVersion,
    'archived',
  )
}

async function transitionEventStatus(
  executor: Executor,
  deps: EventDeps,
  eventId: string,
  expectedVersion: number,
  status: 'published' | 'archived',
): Promise<typeof events.$inferSelect> {
  return executor.transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId)
    if (locked.version !== expectedVersion) {
      throw new StaleWriteError('esemény')
    }
    if (status === 'published') {
      assertPublishable(locked)
    }

    const now = (deps.clock ?? systemClock).now()
    const updated = await tx
      .update(events)
      .set({
        status,
        version: locked.version + 1,
        updatedAt: now,
        updatedBy: deps.viewer.sub,
      })
      .where(eq(events.id, eventId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new EntityNotFoundError('event', eventId)
    }

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'event',
      entityId: eventId,
      action: status === 'published' ? 'publish' : 'archive',
      before: snapshotEvent(locked),
      after: snapshotEvent(row),
      occurredAt: now,
    })
    return row
  })
}

export async function permanentlyDeleteEvent(
  executor: Executor,
  deps: EventDeps,
  eventId: string,
  confirmationTitle: string,
): Promise<{ detachedVideoIds: string[] }> {
  if (!can.permanentlyDeleteEvent(deps.viewer)) {
    throw new ForbiddenError(
      'Eseményt véglegesen csak vezetőségi tag törölhet.',
    )
  }

  return executor.transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId)
    if (confirmationTitle.trim() !== locked.title) {
      throw new EventConfirmationError(locked.title)
    }

    const attached = await tx
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.eventId, eventId))
    const detachedVideoIds = attached.map((row) => row.id)

    // The videos' `recordedAt` values are preserved; only the event link goes away.
    await tx
      .update(videos)
      .set({ eventId: null })
      .where(eq(videos.eventId, eventId))

    // The slug goes into history: it cannot be reused even after permanent deletion.
    await tx.insert(slugHistory).values({
      entityType: 'event',
      slug: locked.slug,
      entityId: locked.id,
      createdAt: (deps.clock ?? systemClock).now(),
    })

    await tx.delete(events).where(eq(events.id, eventId))

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'event',
      entityId: eventId,
      action: 'delete_permanent',
      before: { ...snapshotEvent(locked), detachedVideoIds },
      after: null,
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return { detachedVideoIds }
  })
}

async function lockEvent(executor: Executor, eventId: string) {
  const rows = await executor
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .for('update')
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    throw new EntityNotFoundError('event', eventId)
  }
  return row
}

export async function getEventBySlug(
  executor: Executor,
  slug: string,
): Promise<typeof events.$inferSelect | null> {
  const rows = await executor
    .select()
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1)
  return rows.at(0) ?? null
}

export interface ListEventsOptions {
  status?: 'draft' | 'published' | 'archived'
  limit?: number
  offset?: number
}

export async function listEvents(
  executor: Executor,
  options: ListEventsOptions = {},
): Promise<{ items: Array<typeof events.$inferSelect>; total: number }> {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0
  const where =
    options.status === undefined ? undefined : eq(events.status, options.status)

  const items = await executor
    .select()
    .from(events)
    .where(where)
    .orderBy(desc(events.startDate), desc(events.id))
    .limit(limit)
    .offset(offset)

  const countRows = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(where)
  return { items, total: countRows.at(0)?.count ?? 0 }
}

function snapshotEvent(
  row: typeof events.$inferSelect,
): Record<string, unknown> {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnailUrl,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    version: row.version,
  }
}
