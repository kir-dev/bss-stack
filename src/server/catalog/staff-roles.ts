import { eq, sql } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import { can } from '#/server/auth/policy.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { staffRoles, videoStaff } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import {
  TEXT_LIMITS,
  TextValidationError,
  validateRequiredText,
} from '#/server/shared/text.ts'
import { writeAudit } from '#/server/shared/write.ts'
import { normalizeCatalogName } from './names.ts'
import { CatalogNameConflictError } from './tags.ts'

export class StaffRoleNotFoundError extends Error {
  constructor(roleId: string) {
    super(`A stábszerep nem található: ${roleId}`)
    this.name = 'StaffRoleNotFoundError'
  }
}

export class StaffRoleInUseError extends Error {
  constructor(name: string, usageCount: number) {
    super(
      `A „${name}" stábszerep ${usageCount} videón használatban van, ezért nem törölhető. Előbb vond össze egy másik szereppel.`,
    )
    this.name = 'StaffRoleInUseError'
  }
}

function assertCanManageRoles(viewer: Viewer): void {
  if (!can.manageStaffRoles(viewer)) {
    throw new ForbiddenError('A stábszerepek kezelése vezetőségi jog.')
  }
}

function validatedName(rawName: string): string {
  const name = validateRequiredText(
    'Stábszerep',
    rawName,
    TEXT_LIMITS.tagOrRole,
  )
  return name.trim().replace(/\s+/g, ' ')
}

async function loadRole(executor: Executor, roleId: string) {
  const rows = await executor
    .select()
    .from(staffRoles)
    .where(eq(staffRoles.id, roleId))
    .limit(1)
  const row = rows.at(0)
  if (row === undefined) {
    throw new StaffRoleNotFoundError(roleId)
  }
  return row
}

export interface CatalogDeps {
  viewer: Viewer
  clock?: Clock
}

export async function createStaffRole(
  executor: Executor,
  deps: CatalogDeps,
  rawName: string,
): Promise<typeof staffRoles.$inferSelect> {
  assertCanManageRoles(deps.viewer)
  const name = validatedName(rawName)
  const normalizedName = normalizeCatalogName(name)

  return executor.transaction(async (tx) => {
    const conflict = await tx
      .select({ id: staffRoles.id })
      .from(staffRoles)
      .where(eq(staffRoles.normalizedName, normalizedName))
      .limit(1)
    if (conflict.length > 0) {
      throw new CatalogNameConflictError(name)
    }
    const maxRows = await tx
      .select({ maxOrder: sql<number | null>`max(${staffRoles.displayOrder})` })
      .from(staffRoles)
    const displayOrder = (maxRows.at(0)?.maxOrder ?? 0) + 1

    const inserted = await tx
      .insert(staffRoles)
      .values({ name, normalizedName, displayOrder })
      .returning()
    const row = inserted.at(0)
    if (row === undefined) {
      throw new Error('A stábszerep létrehozása nem sikerült.')
    }
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'staff_role',
      entityId: row.id,
      action: 'create',
      before: null,
      after: { name: row.name, displayOrder: row.displayOrder },
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
}

/**
 * Átnevezés: a szerep azonosítója változatlan marad, így a meglévő
 * stábkapcsolatok nem veszhetnek el (spec BSS-012).
 */
export async function renameStaffRole(
  executor: Executor,
  deps: CatalogDeps,
  roleId: string,
  rawNewName: string,
): Promise<typeof staffRoles.$inferSelect> {
  assertCanManageRoles(deps.viewer)
  const newName = validatedName(rawNewName)
  const newNormalizedName = normalizeCatalogName(newName)

  return executor.transaction(async (tx) => {
    const before = await loadRole(tx, roleId)
    if (before.normalizedName !== newNormalizedName) {
      const others = await executor
        .select({ id: staffRoles.id })
        .from(staffRoles)
        .where(eq(staffRoles.normalizedName, newNormalizedName))
        .limit(1)
      if (others.length > 0) {
        throw new CatalogNameConflictError(newName)
      }
    }
    const updated = await tx
      .update(staffRoles)
      .set({ name: newName, normalizedName: newNormalizedName })
      .where(eq(staffRoles.id, roleId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new StaffRoleNotFoundError(roleId)
    }
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'staff_role',
      entityId: roleId,
      action: 'rename',
      before: { name: before.name },
      after: { name: row.name },
      occurredAt: (deps.clock ?? systemClock).now(),
    })
    return row
  })
}

/** Összevonás: a stábkapcsolatok átkerülnek a célszerephez, kapcsolatvesztés nélkül. */
export async function mergeStaffRole(
  executor: Executor,
  deps: CatalogDeps,
  sourceRoleId: string,
  targetRoleId: string,
): Promise<void> {
  assertCanManageRoles(deps.viewer)
  if (sourceRoleId === targetRoleId) {
    throw new TextValidationError(['A stábszerep önmagába nem vonható össze.'])
  }

  await executor.transaction(async (tx) => {
    const source = await loadRole(tx, sourceRoleId)
    const target = await loadRole(tx, targetRoleId)

    await tx.execute(sql`
      insert into video_staff (video_id, role_id, member_sub)
      select vs.video_id, ${target.id}::uuid, vs.member_sub
      from video_staff vs
      where vs.role_id = ${source.id}::uuid
      on conflict do nothing
    `)
    await tx.delete(videoStaff).where(eq(videoStaff.roleId, source.id))
    await tx.delete(staffRoles).where(eq(staffRoles.id, source.id))

    const now = (deps.clock ?? systemClock).now()
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'staff_role',
      entityId: source.id,
      action: 'merge',
      before: { name: source.name },
      after: { mergedIntoRoleId: target.id, mergedIntoRoleName: target.name },
      occurredAt: now,
    })
  })
}

export async function deleteStaffRole(
  executor: Executor,
  deps: CatalogDeps,
  roleId: string,
): Promise<void> {
  assertCanManageRoles(deps.viewer)

  await executor.transaction(async (tx) => {
    const role = await loadRole(tx, roleId)
    const usageRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(videoStaff)
      .where(eq(videoStaff.roleId, roleId))
    const usageCount = usageRows.at(0)?.count ?? 0
    if (usageCount > 0) {
      throw new StaffRoleInUseError(role.name, usageCount)
    }

    await tx.delete(staffRoles).where(eq(staffRoles.id, roleId))
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'staff_role',
      entityId: roleId,
      action: 'delete',
      before: { name: role.name },
      after: null,
      occurredAt: (deps.clock ?? systemClock).now(),
    })
  })
}

/** Sorrendezés: az átadott azonosítósorrend lesz a `displayOrder`. */
export async function reorderStaffRoles(
  executor: Executor,
  deps: CatalogDeps,
  orderedRoleIds: readonly string[],
): Promise<void> {
  assertCanManageRoles(deps.viewer)

  await executor.transaction(async (tx) => {
    const existing = await tx.select({ id: staffRoles.id }).from(staffRoles)
    const existingIds = new Set(existing.map((row) => row.id))
    for (const roleId of orderedRoleIds) {
      if (!existingIds.has(roleId)) {
        throw new StaffRoleNotFoundError(roleId)
      }
    }
    for (const [index, roleId] of orderedRoleIds.entries()) {
      await tx
        .update(staffRoles)
        .set({ displayOrder: index + 1 })
        .where(eq(staffRoles.id, roleId))
    }
    await writeAudit(tx, {
      actor: deps.viewer.sub ?? '',
      entityType: 'staff_role',
      entityId: orderedRoleIds.join(','),
      action: 'reorder',
      before: null,
      after: { order: [...orderedRoleIds] },
      occurredAt: (deps.clock ?? systemClock).now(),
    })
  })
}

export interface StaffRoleWithUsage {
  id: string
  name: string
  displayOrder: number
  videoCount: number
}

export async function listStaffRolesWithUsage(
  executor: Executor,
): Promise<StaffRoleWithUsage[]> {
  const rows = await executor
    .select({
      id: staffRoles.id,
      name: staffRoles.name,
      displayOrder: staffRoles.displayOrder,
      videoCount: sql<number>`count(${videoStaff.videoId})::int`,
    })
    .from(staffRoles)
    .leftJoin(videoStaff, eq(videoStaff.roleId, staffRoles.id))
    .groupBy(staffRoles.id, staffRoles.name, staffRoles.displayOrder)
    .orderBy(staffRoles.displayOrder, staffRoles.name)
  return rows.map((row) => ({ ...row, videoCount: Number(row.videoCount) }))
}
