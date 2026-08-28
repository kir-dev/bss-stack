import { and, eq } from 'drizzle-orm'
import { webhookDeliveries } from '#/db/schema.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { isUniqueViolation } from '#/server/shared/pg-error.ts'
import { TextValidationError } from '#/server/shared/text.ts'
import {
  applyMemberIngest,
  MemberIngestConflictError,
  parseMemberIngestPayload,
  toIngestConflict,
} from '#/server/members/ingest.ts'
import type { IngestMode, IngestResult } from '#/server/members/ingest.ts'
import {
  authenticateWebhookRequest,
  WebhookAuthError,
} from '#/server/webhooks/clients.ts'
import type { WebhookClientRecord } from '#/server/webhooks/clients.ts'

export { MEMBER_WEBHOOK_PATH } from '#/lib/webhook.ts'

/** Header carrying the client's delivery id; `Idempotency-Key` also works. */
export const DELIVERY_ID_HEADER = 'x-bss-delivery-id'

/** Largest accepted request body; also published in the OpenAPI document. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024
export const DELIVERY_ID_MAX = 200

export interface WebhookRouteDeps {
  db?: Database
  clock?: Clock
}

function json(status: number, payload: unknown, headers = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

function unauthorized(message: string): Response {
  return json(
    401,
    { error: 'unauthorized', message },
    { 'www-authenticate': 'Bearer realm="bss-members"' },
  )
}

function readDeliveryId(request: Request): string | null {
  const raw =
    request.headers.get(DELIVERY_ID_HEADER) ??
    request.headers.get('idempotency-key')
  if (raw === null) {
    return null
  }
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.length > DELIVERY_ID_MAX) {
    return null
  }
  return trimmed
}

async function recordRejection(
  db: Database,
  clientId: string,
  mode: IngestMode,
  deliveryId: string | null,
  message: string,
  now: Date,
): Promise<void> {
  // A rejected push must not claim the idempotency key: the client should be
  // able to retry the same delivery id once the payload is fixed.
  await db.insert(webhookDeliveries).values({
    clientId,
    deliveryId: null,
    mode,
    status: 'rejected',
    operationCount: 0,
    message:
      deliveryId === null ? message : `delivery ${deliveryId}: ${message}`,
    receivedAt: now,
  })
}

/**
 * `POST /api/webhooks/members` — the member ingest endpoint.
 *
 * Deliberately NOT same-origin checked: it is called by external systems with
 * a bearer credential, not by the browser session.
 */
export async function handleMemberWebhook(
  request: Request,
  deps: WebhookRouteDeps = {},
): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') {
    return json(405, {
      error: 'method_not_allowed',
      message: 'Csak POST kérés fogadható.',
    })
  }

  const db = deps.db ?? (await getDefaultDb())
  const clock = deps.clock ?? systemClock
  const now = clock.now()

  let client: WebhookClientRecord
  try {
    client = await authenticateWebhookRequest(db, request, { now })
  } catch (error) {
    if (error instanceof WebhookAuthError) {
      return unauthorized(error.message)
    }
    throw error
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(413, {
      error: 'payload_too_large',
      message: `A kéréstörzs legfeljebb ${MAX_BODY_BYTES} bájt lehet.`,
    })
  }

  const bodyText = await request.text()
  if (Buffer.byteLength(bodyText, 'utf-8') > MAX_BODY_BYTES) {
    return json(413, {
      error: 'payload_too_large',
      message: `A kéréstörzs legfeljebb ${MAX_BODY_BYTES} bájt lehet.`,
    })
  }

  const deliveryId = readDeliveryId(request)

  let raw: unknown
  try {
    raw = JSON.parse(bodyText)
  } catch {
    await recordRejection(
      db,
      client.id,
      'operations',
      deliveryId,
      'Érvénytelen JSON kéréstörzs.',
      now,
    )
    return json(400, {
      error: 'bad_request',
      message: 'Érvénytelen JSON kéréstörzs.',
    })
  }

  let payload
  try {
    payload = parseMemberIngestPayload(raw)
  } catch (error) {
    if (error instanceof TextValidationError) {
      const mode =
        (raw as { mode?: unknown } | null)?.mode === 'replace'
          ? 'replace'
          : 'operations'
      await recordRejection(
        db,
        client.id,
        mode,
        deliveryId,
        error.problems.join(' '),
        now,
      )
      return json(400, {
        error: 'validation',
        problems: error.problems,
        message: error.problems.join(' '),
      })
    }
    throw error
  }

  // An already-seen delivery id is answered without re-applying the payload.
  if (deliveryId !== null) {
    const seen = await db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.clientId, client.id),
          eq(webhookDeliveries.deliveryId, deliveryId),
        ),
      )
      .limit(1)
    if (seen.length > 0) {
      return json(200, {
        ok: true,
        duplicate: true,
        deliveryId,
        message: 'Ez a delivery azonosító már fel lett dolgozva.',
      })
    }
  }

  let result: IngestResult
  try {
    result = await db.transaction(async (tx) => {
      // Claiming the delivery id inside the transaction makes two concurrent
      // retries of the same delivery race-safe: the loser hits the unique index.
      const inserted = await tx
        .insert(webhookDeliveries)
        .values({
          clientId: client.id,
          deliveryId,
          mode: payload.mode,
          status: 'ok',
          operationCount: payload.operations.length,
          receivedAt: now,
        })
        .returning({ id: webhookDeliveries.id })
      const deliveryRowId = inserted.at(0)!.id
      const applied = await applyMemberIngest(tx, payload, {
        actor: `webhook:${client.name}`,
        now,
      })
      await tx
        .update(webhookDeliveries)
        .set({
          createdCount: applied.created,
          updatedCount: applied.updated,
          deletedCount: applied.deleted,
          restoredCount: applied.restored,
        })
        .where(eq(webhookDeliveries.id, deliveryRowId))
      return applied
    })
  } catch (rawError) {
    const error = toIngestConflict(rawError)
    if (isUniqueViolation(rawError, 'delivery')) {
      return json(200, {
        ok: true,
        duplicate: true,
        deliveryId,
        message: 'Ez a delivery azonosító már fel lett dolgozva.',
      })
    }
    if (error instanceof MemberIngestConflictError) {
      await recordRejection(
        db,
        client.id,
        payload.mode,
        deliveryId,
        error.message,
        now,
      )
      return json(409, { error: 'conflict', message: error.message })
    }
    const message =
      rawError instanceof Error ? rawError.message : String(rawError)
    await recordRejection(db, client.id, payload.mode, deliveryId, message, now)
    console.error('[webhook] A tagfrissítés mentése nem sikerült:', message)
    return json(500, {
      error: 'internal',
      message: 'A tagfrissítés mentése nem sikerült. Próbáld újra később.',
    })
  }

  return json(200, { ok: true, duplicate: false, deliveryId, result })
}
