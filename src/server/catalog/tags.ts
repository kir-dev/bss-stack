import { and, eq, ne, sql } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { can } from '#/server/auth/policy.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { tags, videoTags } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import {
  TEXT_LIMITS,
  TextValidationError,
  validateRequiredText,
} from '#/server/shared/text.ts'
import { writeAudit } from '#/server/shared/write.ts'
import { isAccentSimilar, normalizeCatalogName } from './names.ts'

export class CatalogNameConflictError extends Error {
  constructor(name: string) {
    super(`„${name}" nevű címke már létezik.`)
    this.name = 'CatalogNameConflictError'
  }
}

export class TagNotFoundError extends Error {
  constructor(tagId: string) {
    super(`A címke nem található: ${tagId}`)
    this.name = 'TagNotFoundError'
  }
}

export class ConfirmationMismatchError extends Error {
  constructor(expected: string) {
    super(`A törlés megerősítéséhez a címkét nevén kell beírni: „${expected}".`)
    this.name = 'ConfirmationMismatchError'
  }
}

function assertCanManageCatalog(viewer: Viewer): void {
  if (!can.manageTagCatalog(viewer)) {
    throw new ForbiddenError('A címkatalógus kezelése vezetőségi jog.')
  }
}

function validatedName(rawName: string): string {
  const name = validateRequiredText('Címke', rawName, TEXT_LIMITS.tagOrRole)
  return name.trim().replace(/\s+/g, ' ')
}

async function loadTag(executor: Executor, tagId: string) {
  const rows = await executor
    .select()
    .from(tags)
    .where(eq(tags.id, tagId))
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    throw new TagNotFoundError(tagId)
  }
  return row
}

/**
 * Ékezeti hasonlóságra figyelmeztetés (spec 7.1): az ékezet nélkül azonos,
 * de eltérő normalizált nevű meglévő címkék listája. Csak figyelmeztetés, nem blokkol.
 */
export async function findAccentSimilarTagNames(
  executor: Executor,
  rawName: string,
  options: { excludeTagId?: string } = {},
): Promise<string[]> {
  if (normalizeCatalogName(rawName) === '') {
    return []
  }
  const candidates = await executor
    .select({ id: tags.id, name: tags.name })
    .from(tags)
  return candidates
    .filter(
      (candidate) =>
        options.excludeTagId === undefined ||
        candidate.id !== options.excludeTagId,
    )
    .filter((candidate) => isAccentSimilar(rawName, candidate.name))
    .map((candidate) => candidate.name)
}

export interface CatalogDeps {
  viewer: Viewer
  clock?: Clock
}

export async function createTag(
  executor: Executor,
  deps: CatalogDeps,
  rawName: string,
): Promise<typeof tags.$inferSelect> {
  assertCanManageCatalog(deps.viewer)
  const name = validatedName(rawName)
  const normalizedName = normalizeCatalogName(name)

  const created = await executor.transaction(async (tx) => {
    const conflict = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.normalizedName, normalizedName))
      .limit(1)
    if (conflict.length > 0) {
      throw new CatalogNameConflictError(name)
    }
    const inserted = await tx
      .insert(tags)
      .values({ name, normalizedName })
      .returning()
    const row = inserted.at(0)
    if (row === undefined) {
      throw new Error('A címke létrehozása nem sikerült.')
    }
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'tag',
      entityId: row.id,
      action: 'create',
      before: null,
      after: { name: row.name },
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
  return created
}

export async function renameTag(
  executor: Executor,
  deps: CatalogDeps,
  tagId: string,
  rawNewName: string,
): Promise<typeof tags.$inferSelect> {
  assertCanManageCatalog(deps.viewer)
  const newName = validatedName(rawNewName)
  const newNormalizedName = normalizeCatalogName(newName)

  return executor.transaction(async (tx) => {
    const before = await loadTag(tx, tagId)
    if (before.normalizedName !== newNormalizedName) {
      const conflict = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(eq(tags.normalizedName, newNormalizedName), ne(tags.id, tagId)),
        )
        .limit(1)
      if (conflict.length > 0) {
        throw new CatalogNameConflictError(newName)
      }
    }
    const updated = await tx
      .update(tags)
      .set({ name: newName, normalizedName: newNormalizedName })
      .where(eq(tags.id, tagId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new TagNotFoundError(tagId)
    }
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'tag',
      entityId: tagId,
      action: 'rename',
      before: { name: before.name },
      after: { name: row.name },
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
}

/**
 * Összevonás (spec 7.1): minden videókapcsolat a célcímkére kerül, a forrás
 * címke törlődik — egy tranzakcióban. Duplikált videó-címke párok elvesznek.
 */
export async function mergeTag(
  executor: Executor,
  deps: CatalogDeps,
  sourceTagId: string,
  targetTagId: string,
): Promise<void> {
  assertCanManageCatalog(deps.viewer)
  if (sourceTagId === targetTagId) {
    throw new TextValidationError(['A címke önmagába nem vonható össze.'])
  }

  await executor.transaction(async (tx) => {
    const source = await loadTag(tx, sourceTagId)
    const target = await loadTag(tx, targetTagId)

    await tx.execute(sql`
      insert into video_tags (video_id, tag_id)
      select vt.video_id, ${target.id}::uuid
      from video_tags vt
      where vt.tag_id = ${source.id}::uuid
      on conflict do nothing
    `)
    await tx.delete(videoTags).where(eq(videoTags.tagId, source.id))
    await tx.delete(tags).where(eq(tags.id, source.id))

    const now = (deps.clock ?? systemClock).now()
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'tag',
      entityId: source.id,
      action: 'merge',
      before: { name: source.name },
      after: { mergedIntoTagId: target.id, mergedIntoTagName: target.name },
      occurredAt: now,
    })
  })
}

/** Használatban lévő címke csak figyelmeztetés és pontos név-beírás után törölhető. */
export async function deleteTag(
  executor: Executor,
  deps: CatalogDeps,
  tagId: string,
  confirmation?: string,
): Promise<{ deletedVideoLinks: number }> {
  assertCanManageCatalog(deps.viewer)

  return executor.transaction(async (tx) => {
    const tag = await loadTag(tx, tagId)
    const usageRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(videoTags)
      .where(eq(videoTags.tagId, tagId))
    const usageCount = usageRows.at(0)?.count ?? 0

    if (usageCount > 0 && confirmation?.trim() !== tag.name) {
      throw new ConfirmationMismatchError(tag.name)
    }

    await tx.delete(videoTags).where(eq(videoTags.tagId, tagId))
    await tx.delete(tags).where(eq(tags.id, tagId))

    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'tag',
      entityId: tagId,
      action: 'delete',
      before: { name: tag.name, usageCount },
      after: null,
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return { deletedVideoLinks: usageCount }
  })
}

export interface TagWithUsage {
  id: string
  name: string
  videoCount: number
}

/** Katalóguslista használati számmal (figyelmeztetés és admin UI alapja). */
export async function listTagsWithUsage(
  executor: Executor,
): Promise<TagWithUsage[]> {
  const rows = await executor
    .select({
      id: tags.id,
      name: tags.name,
      videoCount: sql<number>`count(${videoTags.videoId})::int`,
    })
    .from(tags)
    .leftJoin(videoTags, eq(videoTags.tagId, tags.id))
    .groupBy(tags.id, tags.name)
    .orderBy(tags.name)
  return rows.map((row) => ({ ...row, videoCount: Number(row.videoCount) }))
}
