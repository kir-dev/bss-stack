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
 * Elavult mentés blokkolása (spec 12.4): ha más módosította a rekordot,
 * a második mentés konfliktust kap. Csendes „utolsó mentés nyer” nincs.
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

/** Auditnapló bejegyzés írása (csak INSERT lehetséges, módosítani nem lehet). */
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
  /** Az a verzió, amelyről a kliens kiindult; eltérés esetén StaleWriteError. */
  expectedVersion: number
  changes: Record<string, unknown>
  actor: string
  clock?: Clock
  /** Audit műveletneve; alapértelmezetten `update`. */
  action?: string
  /**
   * Tranzakción belüli kiegészítő írás (pl. kapcsolatok érvénytelenítése,
   * slug előzmény) — sikertelen futásnál az egész mentés visszagörget.
   */
  afterWrite?: (tx: Executor) => Promise<void>
}

/**
 * Közös, optimista zárolásos frissítés tranzakciós auditbejegyzéssel.
 * - SELECT ... FOR UPDATE zárolja a sort;
 * - verzióeltérés esetén StaleWriteError;
 * - sikeres mentésnél updatedAt/updatedBy/version frissül és audit készül
 *   előtte-utána érték párral;
 * - `system` szereplőnél updatedBy NULL marad (a mező tagokra hivatkozik).
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
