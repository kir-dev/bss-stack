import { asc, desc, eq, lt, sql } from 'drizzle-orm'
import { memberCache, memberSyncRuns } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'

/**
 * Hidden member diagnostics (BSS-032, spec 8.2): leadership can see the
 * Authentik cache state without local profile editing.
 */

export interface DiagnosticsProfile {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  membershipStatus: string
  isLeadership: boolean
  syncStatus: string
  lastSyncError: string | null
  joinedSemesterRaw: string | null
  lastSeenAt: Date
  /** A member last seen before the most recent successful run has likely vanished. */
  likelyVanished: boolean
}

export interface DiagnosticsRun {
  id: number
  trigger: string
  status: string
  startedAt: Date
  finishedAt: Date | null
  totalCount: number
  changedCount: number
  errorCount: number
  message: string | null
}

export interface MemberDiagnostics {
  profiles: DiagnosticsProfile[]
  runs: DiagnosticsRun[]
  summary: {
    total: number
    errorProfiles: number
    likelyVanished: number
    lastRunStatus: string | null
    lastRunMessage: string | null
  }
}

export async function getMemberDiagnostics(
  executor: Executor,
): Promise<MemberDiagnostics> {
  const [profiles, runs, lastOkRun] = await Promise.all([
    executor.select().from(memberCache).orderBy(asc(memberCache.fullName)),
    executor
      .select()
      .from(memberSyncRuns)
      .orderBy(desc(memberSyncRuns.startedAt))
      .limit(20),
    executor
      .select({ finishedAt: memberSyncRuns.finishedAt })
      .from(memberSyncRuns)
      .where(eq(memberSyncRuns.status, 'ok'))
      .orderBy(desc(memberSyncRuns.startedAt))
      .limit(1),
  ])

  // Profiles not seen since the last successful run have presumably
  // vanished from Authentik (their last known record is retained).
  const lastOkFinishedAt = lastOkRun.at(0)?.finishedAt ?? null
  let likelyVanished = 0
  if (lastOkFinishedAt !== null) {
    const vanishedRows = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(memberCache)
      .where(lt(memberCache.lastSeenAt, lastOkFinishedAt))
    likelyVanished = vanishedRows.at(0)?.count ?? 0
  }

  const errorProfiles = profiles.filter(
    (profile) => profile.syncStatus === 'error',
  ).length

  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      membershipStatus: profile.membershipStatus,
      likelyVanished:
        lastOkFinishedAt !== null &&
        profile.lastSeenAt.getTime() < lastOkFinishedAt.getTime(),
    })),
    runs: runs.map((run) => ({
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      totalCount: run.totalCount,
      changedCount: run.changedCount,
      errorCount: run.errorCount,
      message: run.message,
    })),
    summary: {
      total: profiles.length,
      errorProfiles,
      likelyVanished,
      lastRunStatus: runs.at(0)?.status ?? null,
      lastRunMessage: runs.at(0)?.message ?? null,
    },
  }
}
