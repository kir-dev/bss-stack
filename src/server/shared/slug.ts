import { and, eq, ne } from 'drizzle-orm'
import type { Executor } from './db-executor.ts'
import { events, slugHistory, videos } from '#/db/schema.ts'

export type SlugEntityType = 'video' | 'event'
export const SLUG_MAX_LENGTH = 200

const HUNGARIAN_ACCENTS: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ö: 'o',
  ő: 'o',
  ú: 'u',
  ü: 'u',
  ű: 'u',
  Á: 'a',
  É: 'e',
  Í: 'i',
  Ó: 'o',
  Ö: 'o',
  Ő: 'o',
  Ú: 'u',
  Ü: 'u',
  Ű: 'u',
}

export function slugify(title: string): string {
  const folded = title.replace(
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g,
    (char) => HUNGARIAN_ACCENTS[char] ?? char,
  )
  return folded
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-$/g, '')
}

function contentTableFor(entityType: SlugEntityType) {
  return entityType === 'video' ? videos : events
}

/**
 * Finding a unique slug: both the content table AND the slug history forbid
 * collisions — the old slugs of permanently deleted entities are therefore
 * reserved forever.
 */
export async function findFreeSlug(
  executor: Executor,
  entityType: SlugEntityType,
  baseSlug: string,
  options: { excludeEntityId?: string } = {},
): Promise<string> {
  const table = contentTableFor(entityType)
  const base = baseSlug === '' ? 'slug' : baseSlug

  const isTakenByContent = async (candidate: string): Promise<boolean> => {
    const conditions = [eq(table.slug, candidate)]
    if (options.excludeEntityId !== undefined) {
      conditions.push(ne(table.id, options.excludeEntityId))
    }
    const rows = await executor
      .select({ id: table.id })
      .from(table)
      .where(and(...conditions))
      .limit(1)
    return rows.length > 0
  }

  const isTakenByHistory = async (candidate: string): Promise<boolean> => {
    const rows = await executor
      .select({ slug: slugHistory.slug })
      .from(slugHistory)
      .where(
        and(
          eq(slugHistory.entityType, entityType),
          eq(slugHistory.slug, candidate),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  if (!(await isTakenByContent(base)) && !(await isTakenByHistory(base))) {
    return base
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const maxBaseLength = SLUG_MAX_LENGTH - String(suffix).length - 1
    const candidate = `${base.slice(0, maxBaseLength)}-${suffix}`
    if (
      !(await isTakenByContent(candidate)) &&
      !(await isTakenByHistory(candidate))
    ) {
      return candidate
    }
  }
  throw new Error(`Nem található szabad slug a "${base}" alapra.`)
}

/**
 * Slug rename with redirect history: the old slug goes into the history,
 * the uniqueness of the new slug is guaranteed by the content and history checks.
 */
export async function renameSlugWithHistory(
  executor: Executor,
  params: {
    entityType: SlugEntityType
    entityId: string
    currentSlug: string
    newSlugBase: string
    now: Date
  },
): Promise<string> {
  const newSlug = await findFreeSlug(
    executor,
    params.entityType,
    slugify(params.newSlugBase),
    {
      excludeEntityId: params.entityId,
    },
  )
  if (newSlug === params.currentSlug) {
    return params.currentSlug
  }
  await executor.insert(slugHistory).values({
    entityType: params.entityType,
    slug: params.currentSlug,
    entityId: params.entityId,
    createdAt: params.now,
  })
  return newSlug
}

/** Resolve an old slug to an entity identifier (for redirects). */
export async function resolveSlugRedirect(
  executor: Executor,
  entityType: SlugEntityType,
  oldSlug: string,
): Promise<{ entityId: string } | null> {
  const rows = await executor
    .select({ entityId: slugHistory.entityId })
    .from(slugHistory)
    .where(
      and(
        eq(slugHistory.entityType, entityType),
        eq(slugHistory.slug, oldSlug),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}
