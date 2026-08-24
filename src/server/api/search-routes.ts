import { getRequestOrigin } from '#/server/api/http.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { MIN_QUERY_LENGTH, search } from '#/server/search/service.ts'
import type { Database } from '#/server/auth/session-store.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

export interface SearchRouteDeps {
  db?: Database
  config?: OobConfig
}

/**
 * Globális kereső API (spec 11): csoportonként legfeljebb `limit` találat;
 * a jogosultsági szűrés az SQL-ben történik, tiltott videó metaadata nem
 * kerül válaszba. Üres/rövid kifejezésre üres eredményt ad.
 */
export async function handleSearch(
  request: Request,
  deps: SearchRouteDeps = {},
): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json', allow: 'GET' },
    })
  }
  const origin = request.headers.get('origin')
  if (
    origin !== null &&
    origin !== '' &&
    origin !== getRequestOrigin(request)
  ) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  if (query.trim().length < MIN_QUERY_LENGTH) {
    return new Response(
      JSON.stringify({ query, videos: [], events: [], members: [], tags: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  const limitParam = Number(url.searchParams.get('limit'))
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 10)
      : 5

  const { viewer } = await resolveViewerStateFromRequest(request, {
    db: deps.db,
    config: deps.config,
  })
  const db = deps.db ?? (await getDefaultDb())
  const results = await search(db, viewer, query, { limitPerType: limit })

  return new Response(
    JSON.stringify({
      query,
      videos: results.videos.map(({ item }) => ({
        slug: item.slug,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
      })),
      events: results.events.map(({ item }) => ({
        slug: item.slug,
        title: item.title,
        startDate: item.startDate,
      })),
      members: results.members.map(({ item }) => ({
        username: item.username,
        fullName: item.fullName,
        nickname: item.nickname,
        avatarUrl: item.avatarUrl,
      })),
      tags: results.tags.map(({ item }) => ({ name: item.name })),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}
