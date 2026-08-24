import { forbiddenPage, getRequestOrigin } from '#/server/api/http.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import type { Database } from '#/server/auth/session-store.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import {
  AuthRequiredError,
  ForbiddenError,
  requireAdmin,
  requireLeadership,
} from '#/server/auth/guards.ts'
import { CatalogNameConflictError } from '#/server/catalog/tags.ts'
import { StaffRoleInUseError } from '#/server/catalog/staff-roles.ts'
import { EventConfirmationError } from '#/server/events/domain.ts'
import { LiveOverlapError } from '#/server/homepage/live.ts'
import { EntityNotFoundError, StaleWriteError } from '#/server/shared/write.ts'
import { TextValidationError } from '#/server/shared/text.ts'

/**
 * Shared admin API foundations: every endpoint verifies permissions
 * server-side on every request (spec 14), and translates domain errors into
 * Hungarian JSON error messages.
 */

export function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Domain error → machine-readable code + Hungarian message. */
export function errorResponse(error: unknown): Response {
  if (error instanceof AuthRequiredError) {
    return jsonResponse(401, {
      error: 'auth_required',
      loginUrl: error.loginUrl,
      message: error.message,
    })
  }
  if (error instanceof ForbiddenError) {
    return jsonResponse(403, {
      error: 'forbidden',
      message: error.message,
    })
  }
  if (error instanceof StaleWriteError) {
    return jsonResponse(409, {
      error: 'conflict',
      message: error.message,
    })
  }
  if (error instanceof CatalogNameConflictError) {
    return jsonResponse(409, { error: 'name_conflict', message: error.message })
  }
  if (error instanceof LiveOverlapError) {
    return jsonResponse(409, { error: 'overlap', message: error.message })
  }
  if (error instanceof StaffRoleInUseError) {
    return jsonResponse(409, { error: 'role_in_use', message: error.message })
  }
  if (
    error instanceof TextValidationError ||
    error instanceof EventConfirmationError
  ) {
    const problems =
      error instanceof TextValidationError ? error.problems : [error.message]
    return jsonResponse(400, {
      error:
        error instanceof EventConfirmationError ? 'confirmation' : 'validation',
      problems,
      message: problems.join(' '),
    })
  }
  if (error instanceof EntityNotFoundError) {
    return jsonResponse(404, { error: 'not_found', message: error.message })
  }
  // TagNotFoundError / StaffRoleNotFoundError / ConfirmationMismatchError
  if (error instanceof Error && 'name' in error) {
    if (
      error.name === 'TagNotFoundError' ||
      error.name === 'StaffRoleNotFoundError'
    ) {
      return jsonResponse(404, { error: 'not_found', message: error.message })
    }
    if (error.name === 'ConfirmationMismatchError') {
      return jsonResponse(400, {
        error: 'confirmation',
        message: error.message,
        problems: [error.message],
      })
    }
  }
  return jsonResponse(500, {
    error: 'internal',
    message: 'Váratlan szerverhiba történt. Próbáld újra később.',
  })
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('bad body')
    }
    return body as Record<string, unknown>
  } catch {
    throw jsonResponse(400, {
      error: 'bad_request',
      message: 'Érvénytelen kéréstörzs.',
    })
  }
}

export function methodNotAllowed(): Response {
  return jsonResponse(405, { error: 'method_not_allowed' })
}

/** Same-origin request check (CSRF-like protection, as in the view route). */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (
    origin !== null &&
    origin !== '' &&
    origin !== getRequestOrigin(request)
  ) {
    throw forbiddenPage()
  }
}

export interface HandlerDeps {
  db?: Database
  config?: OobConfig
}

export async function runAdminHandler(
  request: Request,
  deps: HandlerDeps,
  handler: (viewer: Viewer) => Promise<Response>,
  options: { allowGet?: boolean } = {},
): Promise<Response> {
  try {
    assertSameOrigin(request)
    const method = request.method.toUpperCase()
    if (method !== 'POST' && !(options.allowGet === true && method === 'GET')) {
      return methodNotAllowed()
    }
    const { viewer } = await resolveViewerStateFromRequest(request, {
      db: deps.db,
      config: deps.config,
    })
    return await handler(viewer)
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    return errorResponse(error)
  }
}

export async function requireAdminViewer(
  request: Request,
  deps: { config?: OobConfig } = {},
): Promise<Viewer> {
  const { viewer } = await resolveViewerStateFromRequest(request, {
    config: deps.config,
  })
  requireAdmin(viewer, new URL(request.url).pathname)
  return viewer
}

export async function requireLeadershipViewer(
  request: Request,
  deps: { config?: OobConfig } = {},
): Promise<Viewer> {
  const { viewer } = await resolveViewerStateFromRequest(request, {
    config: deps.config,
  })
  requireLeadership(viewer)
  return viewer
}
