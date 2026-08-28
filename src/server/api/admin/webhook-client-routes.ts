import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { requireLeadership } from '#/server/auth/guards.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { writeAudit } from '#/server/shared/write.ts'
import {
  createWebhookClient,
  deleteWebhookClient,
  revokeWebhookClient,
  rotateWebhookClientSecret,
} from '#/server/webhooks/clients.ts'
import { jsonResponse, readJsonBody, runAdminHandler } from './http.ts'

export type WebhookClientAction = 'create' | 'rotate' | 'revoke' | 'delete'

export interface AdminWebhookClientRouteDeps {
  db?: Database
  clock?: Clock
  config?: OobConfig
}

/**
 * Leadership-only management of the member webhook credentials.
 * `create` and `rotate` return the bearer token exactly once — it is never
 * recoverable afterwards, only replaceable.
 */
export async function handleAdminWebhookClientRoutes(
  request: Request,
  action: WebhookClientAction,
  clientId: string | undefined,
  deps: AdminWebhookClientRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    requireLeadership(viewer)
    const db = deps.db ?? (await getDefaultDb())
    const now = (deps.clock ?? systemClock).now()
    const actor = viewer.sub ?? ''

    if (action === 'create') {
      const body = await readJsonBody(request)
      const created = await createWebhookClient(db, {
        name: body['name'],
        createdBy: viewer.sub,
      })
      await writeAudit(db, {
        actor,
        entityType: 'webhook_client',
        entityId: created.client.id,
        action: 'create',
        before: null,
        after: { name: created.client.name },
        occurredAt: now,
      })
      return jsonResponse(201, {
        ok: true,
        client: created.client,
        token: created.token,
      })
    }

    if (clientId === undefined) {
      return jsonResponse(404, {
        error: 'not_found',
        message: 'A webhook kliens nem található.',
      })
    }

    if (action === 'rotate') {
      const rotated = await rotateWebhookClientSecret(db, clientId)
      await writeAudit(db, {
        actor,
        entityType: 'webhook_client',
        entityId: clientId,
        action: 'rotate_secret',
        before: null,
        after: { name: rotated.client.name },
        occurredAt: now,
      })
      return jsonResponse(200, {
        ok: true,
        client: rotated.client,
        token: rotated.token,
      })
    }

    if (action === 'revoke') {
      const revoked = await revokeWebhookClient(db, clientId, now)
      await writeAudit(db, {
        actor,
        entityType: 'webhook_client',
        entityId: clientId,
        action: 'revoke',
        before: { name: revoked.name },
        after: null,
        occurredAt: now,
      })
      return jsonResponse(200, { ok: true, client: revoked })
    }

    await deleteWebhookClient(db, clientId)
    await writeAudit(db, {
      actor,
      entityType: 'webhook_client',
      entityId: clientId,
      action: 'delete',
      before: null,
      after: null,
      occurredAt: now,
    })
    return jsonResponse(200, { ok: true })
  })
}
