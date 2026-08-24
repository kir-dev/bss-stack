import { and, desc, eq } from 'drizzle-orm'
import { events, memberCache, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

/**
 * Sitemap (BSS-035, spec 16): csak publikus tartalom kerül bele.
 * Korlátozott (schonherz/bss) vagy nem publikált videó soha.
 */

export interface SitemapEntry {
  path: string
  lastmod: string | null
}

const STATIC_PATHS = ['/videos', '/events', '/members', '/about'] as const

export async function getSitemapEntries(
  executor: Executor,
): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = STATIC_PATHS.map((path) => ({
    path,
    lastmod: null,
  }))

  // Csak publikált ÉS publikus láthatóságú videó (a korlátozott metaadata
  // sem szivároghat a sitemapbe, spec 16/14).
  const videoRows = await executor
    .select({ slug: videos.slug, updatedAt: videos.updatedAt })
    .from(videos)
    .where(and(eq(videos.status, 'published'), eq(videos.visibility, 'public')))
    .orderBy(desc(videos.publishedAt))

  for (const row of videoRows) {
    entries.push({
      path: `/videos/${row.slug}`,
      lastmod: row.updatedAt.toISOString(),
    })
  }

  const eventRows = await executor
    .select({ slug: events.slug, updatedAt: events.updatedAt })
    .from(events)
    .where(eq(events.status, 'published'))
    .orderBy(desc(events.startDate))

  for (const row of eventRows) {
    entries.push({
      path: `/events/${row.slug}`,
      lastmod: row.updatedAt.toISOString(),
    })
  }

  // Csak sikeresen szinkronizált profilok (a publikus listával azonos szabály).
  const memberRows = await executor
    .select({
      username: memberCache.username,
      lastSeenAt: memberCache.lastSeenAt,
    })
    .from(memberCache)
    .where(eq(memberCache.syncStatus, 'ok'))

  for (const row of memberRows) {
    entries.push({
      path: `/members/${row.username}`,
      lastmod: row.lastSeenAt.toISOString(),
    })
  }

  return entries
}

export function sitemapXml(entries: SitemapEntry[], origin: string): string {
  const urls = entries
    .map((entry) => {
      const lastmod =
        entry.lastmod === null ? '' : `<lastmod>${entry.lastmod}</lastmod>`
      return `  <url><loc>${origin}${entry.path}</loc>${lastmod}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
