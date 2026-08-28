import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { requireLeadership } from '#/server/auth/guards.ts'
import {
  createStaffRole,
  deleteStaffRole,
  listStaffRolesWithUsage,
  mergeStaffRole,
  reorderStaffRoles,
  renameStaffRole,
} from '#/server/catalog/staff-roles.ts'
import {
  createTag,
  deleteTag,
  findAccentSimilarTagNames,
  listTagsWithUsage,
  mergeTag,
  renameTag,
} from '#/server/catalog/tags.ts'
import { jsonResponse, readJsonBody, runAdminHandler } from './http.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AdminCatalogRouteDeps {
  db?: Database
  clock?: Clock
}

function badId(): Response {
  return jsonResponse(400, {
    error: 'bad_request',
    message: 'Érvénytelen azonosító.',
  })
}

function parseId(id: string | undefined): string {
  if (id === undefined || !UUID_PATTERN.test(id)) {
    throw badId()
  }
  return id
}

async function stringBody(
  request: Request,
  keys: string[],
): Promise<Record<string, string>> {
  const body = await readJsonBody(request)
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = body[key]
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

export async function handleAdminTagRoutes(
  request: Request,
  action: string,
  id: string | undefined,
  deps: AdminCatalogRouteDeps = {},
): Promise<Response> {
  return runCatalogHandler(
    request,
    deps,
    async (viewer, database) => {
      const catalogDeps = { viewer, clock: deps.clock ?? systemClock }

      switch (action) {
        case 'list': {
          return jsonResponse(200, {
            ok: true,
            tags: await listTagsWithUsage(database),
          })
        }
        case 'similar': {

          const name = new URL(request.url).searchParams.get('name') ?? ''
          const similar = await findAccentSimilarTagNames(
            database,
            name,
            id !== undefined && UUID_PATTERN.test(id)
              ? { excludeTagId: id }
              : {},
          )
          return jsonResponse(200, { ok: true, similar })
        }
        case 'create': {
          const body = await stringBody(request, ['name'])
          const row = await createTag(database, catalogDeps, body['name'] ?? '')
          return jsonResponse(200, { ok: true, id: row.id })
        }
        case 'rename': {
          const body = await stringBody(request, ['name'])
          await renameTag(
            database,
            catalogDeps,
            parseId(id),
            body['name'] ?? '',
          )
          return jsonResponse(200, { ok: true })
        }
        case 'merge': {
          const body = await stringBody(request, ['targetTagId'])
          await mergeTag(
            database,
            catalogDeps,
            parseId(id),
            parseId(body['targetTagId']),
          )
          return jsonResponse(200, { ok: true })
        }
        case 'delete': {
          const body = await stringBody(request, ['confirmation'])
          const result = await deleteTag(
            database,
            catalogDeps,
            parseId(id),
            body['confirmation'],
          )
          return jsonResponse(200, { ok: true, ...result })
        }
        default:
          return jsonResponse(404, { error: 'not_found' })
      }
    },
    { allowGet: true },
  )
}

export async function handleAdminStaffRoleRoutes(
  request: Request,
  action: string,
  id: string | undefined,
  deps: AdminCatalogRouteDeps = {},
): Promise<Response> {
  return runCatalogHandler(
    request,
    deps,
    async (viewer, database) => {
      const catalogDeps = { viewer, clock: deps.clock ?? systemClock }

      switch (action) {
        case 'create': {
          const body = await stringBody(request, ['name'])
          const row = await createStaffRole(
            database,
            catalogDeps,
            body['name'] ?? '',
          )
          return jsonResponse(200, { ok: true, id: row.id })
        }
        case 'rename': {
          const body = await stringBody(request, ['name'])
          await renameStaffRole(
            database,
            catalogDeps,
            parseId(id),
            body['name'] ?? '',
          )
          return jsonResponse(200, { ok: true })
        }
        case 'merge': {
          const body = await stringBody(request, ['targetRoleId'])
          await mergeStaffRole(
            database,
            catalogDeps,
            parseId(id),
            parseId(body['targetRoleId']),
          )
          return jsonResponse(200, { ok: true })
        }
        case 'delete': {
          await deleteStaffRole(database, catalogDeps, parseId(id))
          return jsonResponse(200, { ok: true })
        }
        case 'reorder': {
          const body = await readJsonBody(request)
          const orderedRoleIds = Array.isArray(body['orderedRoleIds'])
            ? body['orderedRoleIds'].filter(
                (item): item is string => typeof item === 'string',
              )
            : []
          await reorderStaffRoles(database, catalogDeps, orderedRoleIds)
          return jsonResponse(200, { ok: true })
        }
        case 'list': {
          return jsonResponse(200, {
            ok: true,
            roles: await listStaffRolesWithUsage(database),
          })
        }
        default:
          return jsonResponse(404, { error: 'not_found' })
      }
    },
    { allowGet: true },
  )
}

/** Shared leadership guard for the two catalogs. */
async function runCatalogHandler(
  request: Request,
  deps: AdminCatalogRouteDeps,
  handler: (viewer: Viewer, database: Database) => Promise<Response>,
  options: { allowGet?: boolean } = {},
): Promise<Response> {
  return runAdminHandler(
    request,
    deps,
    async (viewer) => {
      requireLeadership(viewer)
      const database = deps.db ?? (await getDefaultDb())
      return handler(viewer, database)
    },
    options,
  )
}
