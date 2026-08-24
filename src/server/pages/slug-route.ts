import { and, eq } from 'drizzle-orm'
import { events, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import type { SlugEntityType } from '#/server/shared/slug.ts'
import { resolveSlugRedirect } from '#/server/shared/slug.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { visibleVideoCondition } from '#/server/videos/visibility.ts'

export interface PublicSlugResolution {
  kind: 'current' | 'redirect'
  entityId: string
  canonicalSlug: string
}

/**
 * Publikus slug-route feloldás (BSS-019):
 * - aktuális slugon megtalálható, publikált (videónál a néző számára látható)
 *   entitás → `current`;
 * - régi slug a történetben → átirányítás az új canonical route-ra,
 *   de csak ha az entitás publikált és látható;
 * - piszkozat, archivált, lomtár, véglegesen törölt vagy ismeretlen
 *   → null (a route egységes magyar 404-et ad).
 */
export async function resolvePublicSlug(
  executor: Executor,
  params: {
    entityType: SlugEntityType
    slug: string
    viewer: Viewer
  },
): Promise<PublicSlugResolution | null> {
  const current = await findPublishedBySlug(executor, params)
  if (current !== null) {
    return {
      kind: 'current',
      entityId: current.id,
      canonicalSlug: current.slug,
    }
  }

  // A régi slug átirányításként megmarad (spec 4.2), de nem mutathat
  // publikusan elérhetetlen tartalomra.
  const redirect = await resolveSlugRedirect(
    executor,
    params.entityType,
    params.slug,
  )
  if (redirect === null) {
    return null
  }
  if (params.entityType === 'video') {
    const rows = await executor
      .select({ id: videos.id, slug: videos.slug })
      .from(videos)
      .where(
        and(
          eq(videos.id, redirect.entityId),
          eq(videos.status, 'published'),
          visibleVideoCondition(params.viewer),
        ),
      )
      .limit(1)
    const row = rows.at(0)
    return row === undefined
      ? null
      : { kind: 'redirect', entityId: row.id, canonicalSlug: row.slug }
  }
  const eventRows = await executor
    .select({ id: events.id, slug: events.slug })
    .from(events)
    .where(
      and(eq(events.id, redirect.entityId), eq(events.status, 'published')),
    )
    .limit(1)
  const event = eventRows.at(0)
  return event === undefined
    ? null
    : { kind: 'redirect', entityId: event.id, canonicalSlug: event.slug }
}

async function findPublishedBySlug(
  executor: Executor,
  params: { entityType: SlugEntityType; slug: string; viewer: Viewer },
): Promise<{ id: string; slug: string } | null> {
  if (params.entityType === 'video') {
    const rows = await executor
      .select({ id: videos.id, slug: videos.slug })
      .from(videos)
      .where(
        and(
          eq(videos.slug, params.slug),
          eq(videos.status, 'published'),
          visibleVideoCondition(params.viewer),
        ),
      )
      .limit(1)
    return rows.at(0) ?? null
  }
  const rows = await executor
    .select({ id: events.id, slug: events.slug })
    .from(events)
    .where(and(eq(events.slug, params.slug), eq(events.status, 'published')))
    .limit(1)
  return rows.at(0) ?? null
}
