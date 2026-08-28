import type { OobConfig } from '#/server/config/oob-schema.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError, requireAdmin } from '#/server/auth/guards.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import {
  archiveVideo,
  createVideoDraft,
  publishVideo,
  restoreVideoFromTrash,
  setVideoStaff,
  setVideoTags,
  trashVideo,
  updateVideo,
} from '#/server/videos/domain.ts'
import { setManualRelatedVideos } from '#/server/videos/related.ts'
import type { MediaConfig } from '#/server/media/validator.ts'
import { DEFAULT_MEDIA_CONFIG } from '#/server/media/validator.ts'
import { jsonResponse, readJsonBody, runAdminHandler } from './http.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AdminVideoRouteDeps {
  db?: Database
  config?: OobConfig
  clock?: Clock
  fetchImpl?: typeof fetch
}

function badRequest(message: string): Response {
  return jsonResponse(400, { error: 'bad_request', message })
}

function parseVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw badRequest('A verziószám (version) kötelező pozitív egész szám.')
  }
  return value
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw badRequest('A mező sztringlista kell legyen.')
  }
  return value.filter((item): item is string => typeof item === 'string')
}

export async function handleAdminVideoRoutes(
  request: Request,
  action: string,
  id: string | undefined,
  deps: AdminVideoRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    // anonymous → 401 with login URL, authenticated unauthorized → 403.
    requireAdmin(viewer, new URL(request.url).pathname)
    const db = deps.db ?? (await getDefaultDb())
    const mediaConfig = mediaConfigOf(deps)
    const domainDeps = {
      viewer,
      clock: deps.clock ?? systemClock,
      mediaConfig,
      fetchImpl: deps.fetchImpl,
    }

    if (action === 'create' && id === undefined) {
      const body = await readJsonBody(request)
      const row = await createVideoDraft(db, domainDeps, {
        title: typeof body['title'] === 'string' ? body['title'] : '',
      })
      return jsonResponse(200, { ok: true, id: row.id, slug: row.slug })
    }

    if (id === undefined || !UUID_PATTERN.test(id)) {
      return badRequest('Érvénytelen videóazonosító.')
    }
    const body = await readJsonBody(request)

    switch (action) {
      case 'update': {
        const result = await updateVideo(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
          {
            title: optionalString(body['title']),
            description: optionalNullableString(body['description']),
            guests: optionalNullableString(body['guests']),
            songs: optionalNullableString(body['songs']),
            encodingGroup: optionalEncodingGroup(body['encodingGroup']),
            hasHq: optionalBoolean(body['hasHq'], 'hasHq'),
            hasLq: optionalBoolean(body['hasLq'], 'hasLq'),
            baseFilename: optionalNullableString(body['baseFilename']),
            visibility: optionalVisibility(body['visibility']),
            recordedAt: optionalNullableString(body['recordedAt']),
            eventId: optionalNullableId(body['eventId'], 'eventId'),
            slug: optionalString(body['slug']),
            publishedAt: optionalPublishedAt(body['publishedAt']),
          },
        )
        return jsonResponse(200, {
          ok: true,
          version: result.row.version,
          slug: result.row.slug,
          warnings: result.warnings,
        })
      }
      case 'publish': {
        const result = await publishVideo(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
        )
        return jsonResponse(200, {
          ok: true,
          version: result.row.version,
          slug: result.row.slug,
          warnings: result.warnings,
        })
      }
      case 'archive': {
        const result = await archiveVideo(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
        )
        return jsonResponse(200, {
          ok: true,
          version: result.row.version,
          slug: result.row.slug,
        })
      }
      case 'trash': {
        const result = await trashVideo(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
        )
        return jsonResponse(200, {
          ok: true,
          version: result.row.version,
          slug: result.row.slug,
        })
      }
      case 'restore': {
        if (!can.restoreVideo(viewer)) {
          throw new ForbiddenError(
            'A lomtárból való visszaállítás vezetőségi jog.',
          )
        }
        const result = await restoreVideoFromTrash(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
        )
        return jsonResponse(200, {
          ok: true,
          version: result.row.version,
          slug: result.row.slug,
        })
      }
      case 'tags': {
        const result = await setVideoTags(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
          parseStringArray(body['tagIds']),
        )
        return jsonResponse(200, { ok: true, version: result.row.version })
      }
      case 'staff': {
        const rawAssignments = body['assignments']
        if (!Array.isArray(rawAssignments)) {
          return badRequest('A stáblista (assignments) lista kell legyen.')
        }
        const assignments = []
        for (const entry of rawAssignments) {
          if (
            entry === null ||
            typeof entry !== 'object' ||
            typeof (entry as Record<string, unknown>)['roleId'] !== 'string' ||
            typeof (entry as Record<string, unknown>)['memberSub'] !== 'string'
          ) {
            return badRequest(
              'Minden stábbetetésnek roleId és memberSub mezője kell legyen.',
            )
          }
          assignments.push({
            roleId: (entry as Record<string, string>)['roleId'],
            memberSub: (entry as Record<string, string>)['memberSub'],
          })
        }
        const result = await setVideoStaff(
          db,
          domainDeps,
          id,
          parseVersion(body['version']),
          assignments,
        )
        return jsonResponse(200, { ok: true, version: result.row.version })
      }
      case 'related': {
        const result = await setManualRelatedVideos(db, {
          viewer,
          videoId: id,
          expectedVersion: parseVersion(body['version']),
          relatedVideoIds: parseStringArray(body['relatedVideoIds']),
          clock: deps.clock,
        })
        return jsonResponse(200, { ok: true, version: result.version })
      }
      default:
        return jsonResponse(404, { error: 'not_found' })
    }
  })
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function optionalVisibility(
  value: unknown,
): 'public' | 'schonherz' | 'bss' | undefined {
  if (value === 'public' || value === 'schonherz' || value === 'bss') {
    return value
  }
  return undefined
}

function optionalEncodingGroup(
  value: unknown,
): '4a3_SD' | '16a9_SD' | '16a9_HD' | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (value === '4a3_SD' || value === '16a9_SD' || value === '16a9_HD') {
    return value
  }
  throw badRequest('Érvénytelen videóprofil.')
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  throw badRequest(`A ${field} mező logikai érték kell legyen.`)
}

function optionalNullableId(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw badRequest(`Érvénytelen azonosító a ${field} mezőben.`)
  }
  return value
}

/** A past `publishedAt` can be given; a future one is rejected by the domain. */
function optionalPublishedAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw badRequest('A feltöltés időpontja érvénytelen dátum.')
  }
  return date
}

export function mediaConfigOf(_deps: AdminVideoRouteDeps): MediaConfig {
  return DEFAULT_MEDIA_CONFIG
}
