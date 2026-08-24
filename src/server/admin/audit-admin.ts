import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { auditLog } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

/**
 * Auditnapló admin (BSS-033, spec 13.2): csak olvasható, vezetőségi nézet
 * szereplő-, művelet-, entitás- és dátumszűrővel. Módosítás, törlés és
 * export nincs (spec 19) — a DB-trigger is tiltja az írást.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface AuditFilters {
  actor?: string
  action?: string
  entityType?: string
  entityId?: string
  dateFrom?: string
  dateTo?: string
}

export function parseAuditFilters(raw: Record<string, unknown>): AuditFilters {
  const filters: AuditFilters = {}
  if (typeof raw['actor'] === 'string' && raw['actor'].trim() !== '') {
    filters.actor = raw['actor'].trim()
  }
  if (typeof raw['action'] === 'string' && raw['action'].trim() !== '') {
    filters.action = raw['action'].trim()
  }
  if (
    typeof raw['entityType'] === 'string' &&
    raw['entityType'].trim() !== ''
  ) {
    filters.entityType = raw['entityType'].trim()
  }
  if (typeof raw['entityId'] === 'string' && raw['entityId'].trim() !== '') {
    filters.entityId = raw['entityId'].trim()
  }
  if (typeof raw['from'] === 'string' && DATE_PATTERN.test(raw['from'])) {
    filters.dateFrom = raw['from']
  }
  if (typeof raw['to'] === 'string' && DATE_PATTERN.test(raw['to'])) {
    filters.dateTo = raw['to']
  }
  return filters
}

export interface AuditListItem {
  id: number
  actor: string
  entityType: string
  entityId: string
  action: string
  /** Előtte-utána értékek kliensbiztos JSON szövegként. */
  beforeJson: string | null
  afterJson: string | null
  occurredAt: Date
}

export async function getAuditPage(
  executor: Executor,
  query: { page: number; perPage: number; filters?: AuditFilters },
): Promise<{
  items: AuditListItem[]
  total: number
  page: number
  perPage: number
  totalPages: number
}> {
  const conditions: SQL[] = []
  const filters = query.filters ?? {}
  if (filters.actor !== undefined) {
    // `system` szereplő és tagok egyaránt kereshetők.
    conditions.push(eq(auditLog.actor, filters.actor))
  }
  if (filters.action !== undefined) {
    conditions.push(eq(auditLog.action, filters.action))
  }
  if (filters.entityType !== undefined) {
    conditions.push(eq(auditLog.entityType, filters.entityType))
  }
  if (filters.entityId !== undefined) {
    conditions.push(eq(auditLog.entityId, filters.entityId))
  }
  if (filters.dateFrom !== undefined) {
    conditions.push(
      gte(auditLog.occurredAt, new Date(`${filters.dateFrom}T00:00:00Z`)),
    )
  }
  if (filters.dateTo !== undefined) {
    conditions.push(
      lte(auditLog.occurredAt, new Date(`${filters.dateTo}T23:59:59Z`)),
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [items, countRows] = await Promise.all([
    executor
      .select({
        id: auditLog.id,
        actor: auditLog.actor,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        beforeValue: auditLog.beforeValue,
        afterValue: auditLog.afterValue,
        occurredAt: auditLog.occurredAt,
      })
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
  ])

  const total = countRows.at(0)?.count ?? 0
  return {
    items: items.map((item) => ({
      ...item,
      beforeJson:
        item.beforeValue === null || item.beforeValue === undefined
          ? null
          : JSON.stringify(item.beforeValue, null, 2),
      afterJson:
        item.afterValue === null || item.afterValue === undefined
          ? null
          : JSON.stringify(item.afterValue, null, 2),
    })),
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: query.perPage > 0 ? Math.ceil(total / query.perPage) : 0,
  }
}

/** Az elérhető művelet- és entitástípus-értékek a szűrőkhöz. */
export async function getAuditFilterValues(
  executor: Executor,
): Promise<{ actions: string[]; entityTypes: string[] }> {
  const [actions, entityTypes] = await Promise.all([
    executor
      .selectDistinct({ value: auditLog.action })
      .from(auditLog)
      .orderBy(auditLog.action),
    executor
      .selectDistinct({ value: auditLog.entityType })
      .from(auditLog)
      .orderBy(auditLog.entityType),
  ])
  return {
    actions: actions.map((row) => row.value),
    entityTypes: entityTypes.map((row) => row.value),
  }
}
