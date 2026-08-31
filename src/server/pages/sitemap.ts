import { and, desc, eq, isNull } from 'drizzle-orm'
import { events, memberCache, videos } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

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

  // Only published videos AND with public visibility (even a restricted video's metadata must not be indexed).

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

  // Only live profiles (same rule as the public list).
  const memberRows = await executor
    .select({
      username: memberCache.username,
      updatedAt: memberCache.updatedAt,
    })
    .from(memberCache)
    .where(isNull(memberCache.archivedAt))

  for (const row of memberRows) {
    entries.push({
      path: `/members/${row.username}`,
      lastmod: row.updatedAt.toISOString(),
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
