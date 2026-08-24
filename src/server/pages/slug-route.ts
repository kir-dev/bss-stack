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
 * Public slug-route resolution (BSS-019):
 * - on the current slug the published entity is found (for videos, visible to
 *   the viewer) → `current`;
 * - an old slug in the history → redirect to the new canonical route,
 *   but only if the entity is published and visible;
 * - draft, archived, trash, permanently deleted or unknown
 *   → null (the route returns a uniform Hungarian 404).
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

  // The old slug is preserved as a redirect (spec 4.2), but it must not point
  // to publicly unreachable content.
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
