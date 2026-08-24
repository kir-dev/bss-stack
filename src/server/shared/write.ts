import { and, eq } from 'drizzle-orm'
import { auditLog, events, videos } from '#/db/schema.ts'
import type { Clock } from '#/lib/clock.ts'
import type { Executor } from './db-executor.ts'

export const SYSTEM_ACTOR = 'system'

export class EntityNotFoundError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`${entityType} nem található: ${entityId}`)
    this.name = 'EntityNotFoundError'
  }
}

/**
 * Blocking stale writes (spec 12.4): if someone else modified the record,
 * the second save gets a conflict. There is no silent "last write wins".
 */
export class StaleWriteError extends Error {
  constructor(entityType: string) {
    super(
      `A ${entityType} időközben megváltozott (elavult mentés). Töltsd be az új állapotot, majd próbáld újra.`,
    )
    this.name = 'StaleWriteError'
  }
}

function tableFor(entityType: 'video' | 'event') {
  return entityType === 'video' ? videos : events
}

/** Writing an audit log entry (only INSERT is possible, it cannot be modified). */
export async function writeAudit(
  executor: Executor,
  entry: {
    actor: string
    entityType: string
    entityId: string
    action: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
    occurredAt: Date
  },
): Promise<void> {
  await executor.insert(auditLog).values({
    actor: entry.actor,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    beforeValue: entry.before,
    afterValue: entry.after,
    occurredAt: entry.occurredAt,
  })
}

export interface OptimisticUpdateParams {
  db: Executor
  entityType: 'video' | 'event'
  entityId: string
  /** The version the client started from; on mismatch a StaleWriteError is thrown. */
  expectedVersion: number
  changes: Record<string, unknown>
  actor: string
  clock?: Clock
  /** Audit action name; defaults to `update`. */
  action?: string
  /**
   * Supplementary write inside the transaction (e.g. invalidating relations,
   * slug history) — on failure the entire save is rolled back.
   */
  afterWrite?: (tx: Executor) => Promise<void>
}

/**
 * Common optimistic-lock update with a transactional audit entry.
 * - SELECT ... FOR UPDATE locks the row;
 * - on a version mismatch a StaleWriteError is thrown;
 * - on a successful save updatedAt/updatedBy/version are updated and an audit
 *   entry with a before-after value pair is written;
 * - for the `system` actor updatedBy stays NULL (the field references members).
 */
export async function updateWithOptimisticLock(
  params: OptimisticUpdateParams,
): Promise<{ version: number }> {
  const clock = params.clock
  const now = clock ? clock.now() : new Date()
  const table = tableFor(params.entityType)

  return params.db.transaction(async (tx) => {
    const lockedRows = await tx
      .select()
      .from(table)
      .where(eq(table.id, params.entityId))
      .for('update')
      .limit(1)

    if (lockedRows.length === 0) {
      throw new EntityNotFoundError(params.entityType, params.entityId)
    }
    const row = lockedRows[0] as unknown as {
      version: number
      createdBy: string | null
      createdAt: Date
    }

    if (row.version !== params.expectedVersion) {
      throw new StaleWriteError(params.entityType)
    }

    const before = snapshotRow(row)
    const nextVersion = row.version + 1
    const updatedBy = params.actor === SYSTEM_ACTOR ? null : params.actor

    await tx
      .update(table)
      .set({
        ...params.changes,
        version: nextVersion,
        updatedAt: now,
        updatedBy,
      })
      .where(and(eq(table.id, params.entityId), eq(table.version, row.version)))

    const after = snapshotRow({
      ...(row as Record<string, unknown>),
      ...params.changes,
      version: nextVersion,
      updatedBy,
      updatedAt: now,
    })

    await writeAudit(tx, {
      actor: params.actor,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action ?? 'update',
      before,
      after,
      occurredAt: now,
    })

    if (params.afterWrite !== undefined) {
      await params.afterWrite(tx)
    }

    return { version: nextVersion }
  })
}

function snapshotRow(row: Record<string, unknown>): Record<string, unknown> {
  const systemKeys = new Set(['trashedAt', 'trashedBy'])
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !systemKeys.has(key))
      .map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
  )
}
