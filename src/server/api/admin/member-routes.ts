import type { Database } from '#/server/auth/session-store.ts'
import type { Clock } from '#/lib/clock.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { requireLeadership } from '#/server/auth/guards.ts'
import { jsonResponse, runAdminHandler } from './http.ts'
import { triggerManualMemberSync } from '#/server/members/sync.ts'

export interface AdminMemberRouteDeps {
  db?: Database
  clock?: Clock
  config?: OobConfig
  fetchImpl?: typeof fetch
  loadConfig?: () => OobConfig
}

/**
 * Manual member sync (BSS-032): can only be triggered by leadership; the
 * sync runs on the BSS-008 service, is audited and records its status.
 */
export async function handleAdminMemberSyncRoute(
  request: Request,
  deps: AdminMemberRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    requireLeadership(viewer)
    const result = await triggerManualMemberSync(viewer, syncDeps(deps))
    return jsonResponse(200, {
      ok: result.status === 'ok',
      result,
    })
  })
}

function syncDeps(
  deps: AdminMemberRouteDeps,
): Parameters<typeof triggerManualMemberSync>[1] {
  return {
    db: deps.db,
    clock: deps.clock,
    fetchImpl: deps.fetchImpl,
    ...(deps.loadConfig !== undefined ? { loadConfig: deps.loadConfig } : {}),
  }
}
