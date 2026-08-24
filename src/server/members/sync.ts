import { eq } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'

import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { requireLeadership } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { getCachedOobConfig } from '#/server/config/load.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { fetchDiscovery } from '#/server/auth/oidc.ts'
import { createAuthentikApi } from './authentik-api.ts'
import { mapMember } from './map.ts'
import type { MappedMember } from './map.ts'
import { auditLog, memberCache, memberSyncRuns } from '#/db/schema.ts'

export type SyncTrigger = 'startup' | 'hourly' | 'manual' | 'test'

export interface SyncRunResult {
  trigger: SyncTrigger
  status: 'ok' | 'error'
  totalCount: number
  changedCount: number
  errorCount: number
  startedAt: Date
  finishedAt: Date
  message: string | null
}

export interface MemberSyncDeps {
  db?: Database
  clock?: Clock
  fetchImpl?: typeof fetch
  loadConfig?: () => OobConfig
}

const SYNC_FIELDS = [
  'username',
  'fullName',
  'nickname',
  'avatarUrl',
  'membershipStatus',
  'isLeadership',
  'joinedYear',
  'joinedSemester',
  'joinedSemesterRaw',
  'introduction',
] as const

function memberDiffers(
  existing: typeof memberCache.$inferSelect,
  mapped: MappedMember,
): boolean {
  return (
    existing.username !== mapped.username ||
    existing.fullName !== mapped.fullName ||
    (existing.nickname ?? null) !== mapped.nickname ||
    (existing.avatarUrl ?? null) !== mapped.avatarUrl ||
    existing.membershipStatus !== mapped.membershipStatus ||
    existing.isLeadership !== mapped.isLeadership ||
    (existing.joinedYear ?? null) !== mapped.joinedYear ||
    (existing.joinedSemester ?? null) !== mapped.joinedSemester ||
    (existing.joinedSemesterRaw ?? null) !== mapped.joinedSemesterRaw ||
    (existing.introduction ?? null) !== mapped.introduction
  )
}

function snapshot(
  member: typeof memberCache.$inferSelect | MappedMember,
): Record<string, unknown> {
  const source = member as Record<string, unknown>
  return Object.fromEntries(
    SYNC_FIELDS.map((field) => [field, source[field] ?? null]),
  )
}

async function writeAuditEntry(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  entry: {
    action: string
    entityId: string
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
    at: Date
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    actor: 'system',
    entityType: 'member_cache',
    entityId: entry.entityId,
    action: entry.action,
    beforeValue: entry.before,
    afterValue: entry.after,
    occurredAt: entry.at,
  })
}

/**
 * Member cache sync: reads the Authentik users and writes them into a local,
 * read-only cache.
 *
 * Rules based on chapter 8 of the specification:
 * - the last known record of a disappeared member is preserved (never deleted);
 * - a profile with unknown status or format is marked as erroneous and is not
 *   placed into the public group;
 * - an audit entry (with `system` as actor) is written only on actual change;
 * - every run is recorded in the member_sync_runs table.
 */
export async function runMemberSync(
  trigger: SyncTrigger,
  deps: MemberSyncDeps = {},
): Promise<SyncRunResult> {
  const database = deps.db ?? (await getDefaultDb())
  const clock = deps.clock ?? systemClock
  const loadConfig = deps.loadConfig ?? getCachedOobConfig
  const startedAt = clock.now()

  try {
    const config = loadConfig()
    const discovery = await fetchDiscovery(config.authentik, {
      fetchImpl: deps.fetchImpl,
    })
    const api = createAuthentikApi(config.authentik, {
      fetchImpl: deps.fetchImpl,
      tokenEndpoint: discovery.tokenEndpoint,
    })

    const [users, groups] = await Promise.all([
      api.listUsers(),
      api.listGroups(),
    ])
    const groupNamesByPk = new Map(
      groups.map((group) => [group.pk, group.name]),
    )

    const mappedMembers: MappedMember[] = []
    for (const user of users) {
      const names = new Set(
        user.groups
          .map((pk) => groupNamesByPk.get(pk))
          .filter((name): name is string => name !== undefined),
      )
      const mapped = mapMember(user, names, config.authentik)
      if (mapped !== null) {
        mappedMembers.push(mapped)
      }
    }

    let changedCount = 0
    let errorCount = 0

    await database.transaction(async (tx) => {
      for (const mapped of mappedMembers) {
        const existingRows = await tx
          .select()
          .from(memberCache)
          .where(eq(memberCache.sub, mapped.sub))
          .limit(1)
        const existing = existingRows.at(0)

        if (mapped.syncStatus === 'error') {
          errorCount += 1
          if (existing !== undefined) {
            // Keep the last known data; only the error flag is updated.
            if (existing.syncStatus !== 'error') {
              await tx
                .update(memberCache)
                .set({
                  syncStatus: 'error',
                  lastSyncError: mapped.syncError,
                  lastSeenAt: startedAt,
                })
                .where(eq(memberCache.sub, mapped.sub))
              await writeAuditEntry(tx, {
                action: 'sync_error',
                entityId: mapped.sub,
                before: snapshot(existing),
                after: null,
                at: startedAt,
              })
              changedCount += 1
            }
          }
          continue
        }

        if (!existing) {
          await tx.insert(memberCache).values({
            sub: mapped.sub,
            username: mapped.username,
            fullName: mapped.fullName,
            nickname: mapped.nickname,
            avatarUrl: mapped.avatarUrl,
            membershipStatus: mapped.membershipStatus,
            isLeadership: mapped.isLeadership,
            joinedYear: mapped.joinedYear,
            joinedSemester: mapped.joinedSemester,
            joinedSemesterRaw: mapped.joinedSemesterRaw,
            introduction: mapped.introduction,
            syncStatus: 'ok',
            lastSyncError: null,
            lastSeenAt: startedAt,
            updatedAt: startedAt,
          })
          await writeAuditEntry(tx, {
            action: 'create',
            entityId: mapped.sub,
            before: null,
            after: snapshot(mapped),
            at: startedAt,
          })
          changedCount += 1
          continue
        }

        if (memberDiffers(existing, mapped)) {
          await tx
            .update(memberCache)
            .set({
              username: mapped.username,
              fullName: mapped.fullName,
              nickname: mapped.nickname,
              avatarUrl: mapped.avatarUrl,
              membershipStatus: mapped.membershipStatus,
              isLeadership: mapped.isLeadership,
              joinedYear: mapped.joinedYear,
              joinedSemester: mapped.joinedSemester,
              joinedSemesterRaw: mapped.joinedSemesterRaw,
              introduction: mapped.introduction,
              syncStatus: 'ok',
              lastSyncError: null,
              lastSeenAt: startedAt,
              updatedAt: startedAt,
            })
            .where(eq(memberCache.sub, mapped.sub))
          await writeAuditEntry(tx, {
            action: 'update',
            entityId: mapped.sub,
            before: snapshot(existing),
            after: snapshot(mapped),
            at: startedAt,
          })
          changedCount += 1
          continue
        }

        // Unchanged: only the last-seen timestamp is updated, NO audit entry is written.
        await tx
          .update(memberCache)
          .set({ lastSeenAt: startedAt })
          .where(eq(memberCache.sub, mapped.sub))

        if (existing.syncStatus === 'error') {
          // Previously erroneous but now valid profile: the improvement counts as a change.
          await tx
            .update(memberCache)
            .set({ syncStatus: 'ok', lastSyncError: null })
            .where(eq(memberCache.sub, mapped.sub))
          changedCount += 1
        }
      }
    })

    const finishedAt = clock.now()
    const result: SyncRunResult = {
      trigger,
      status: 'ok',
      totalCount: mappedMembers.length,
      changedCount,
      errorCount,
      startedAt,
      finishedAt,
      message: null,
    }
    await database.insert(memberSyncRuns).values({
      trigger,
      status: 'ok',
      startedAt,
      finishedAt,
      totalCount: result.totalCount,
      changedCount,
      errorCount,
      message: null,
    })
    return result
  } catch (error) {
    const finishedAt = clock.now()
    const message =
      error instanceof Error
        ? error.message
        : String(error ?? 'ismeretlen hiba')
    await database.insert(memberSyncRuns).values({
      trigger,
      status: 'error',
      startedAt,
      finishedAt,
      totalCount: 0,
      changedCount: 0,
      errorCount: 0,
      message,
    })
    return {
      trigger,
      status: 'error',
      totalCount: 0,
      changedCount: 0,
      errorCount: 0,
      startedAt,
      finishedAt,
      message,
    }
  }
}

/** Start a manual sync: only leadership members are authorized. */
export async function triggerManualMemberSync(
  viewer: Viewer,
  deps: MemberSyncDeps = {},
): Promise<SyncRunResult> {
  requireLeadership(viewer)
  return runMemberSync('manual', deps)
}
