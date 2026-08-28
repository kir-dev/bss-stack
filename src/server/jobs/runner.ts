import { desc } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { memberSyncRuns } from '#/db/schema.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { requireLeadership } from '#/server/auth/guards.ts'
import type { LockManager } from './locks.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import type { MemberSyncDeps, SyncTrigger } from '#/server/members/sync.ts'
import { runMemberSync } from '#/server/members/sync.ts'

export interface JobContext {
  clock: Clock
  trigger: SyncTrigger | 'tick'
}

export interface JobDefinition {
  /** Fixed name; the advisory lock key derives from it. */
  name: string
  /**
   * Schedule in milliseconds after the job's last (successful or failed)
   * run. Jobs marked `startup` run once at startup.
   */
  intervalMs: number | 'startup'
  run: (ctx: JobContext) => Promise<void>
}

export interface JobRunRecord {
  jobName: string
  startedAt: Date
  finishedAt: Date
  status: 'ok' | 'error' | 'skipped-locked'
  message: string | null
}

/**
 * Background job registry. The tests, together with the FakeClock,
 * drive the passage of time via `runDueJobs` calls.
 */
export class JobRegistry {
  private readonly jobs = new Map<string, JobDefinition>()
  private readonly lastFinishedAt = new Map<string, Date>()

  register(job: JobDefinition): void {
    this.jobs.set(job.name, job)
  }

  getJob(name: string): JobDefinition | undefined {
    return this.jobs.get(name)
  }

  list(): JobDefinition[] {
    return [...this.jobs.values()]
  }

  setLastFinishedAt(name: string, at: Date): void {
    this.lastFinishedAt.set(name, at)
  }

  getLastFinishedAt(name: string): Date | undefined {
    return this.lastFinishedAt.get(name)
  }
}

export interface RunDueJobsOptions {
  registry: JobRegistry
  now: Date
  execute?: (job: JobDefinition) => Promise<JobRunRecord>
}

/** The startup and due interval jobs that must run now. */
export function dueJobs(registry: JobRegistry, now: Date): JobDefinition[] {
  return registry.list().filter((job) => {
    if (job.intervalMs === 'startup') {
      return !registry.getLastFinishedAt(job.name)
    }
    const last = registry.getLastFinishedAt(job.name)
    if (!last) {
      return true
    }
    return now.getTime() - last.getTime() >= job.intervalMs
  })
}

export interface RunnerDeps extends MemberSyncDeps {
  lockManager?: LockManager
}

/**
 * Run a single job under an advisory lock. If the lock is held by another
 * instance, the run is skipped with a `skipped-locked` result — so two
 * application instances never run the same job twice.
 */
export async function runJobWithLock(
  job: JobDefinition,
  deps: RunnerDeps,
): Promise<JobRunRecord> {
  const clock = deps.clock ?? systemClock
  const locks =
    deps.lockManager ?? (await import('./locks.ts')).createPgLockManager()
  const startedAt = clock.now()

  const lock = await locks.acquire(job.name)
  if (lock === null) {
    return {
      jobName: job.name,
      startedAt,
      finishedAt: clock.now(),
      status: 'skipped-locked',
      message: null,
    }
  }

  try {
    await job.run({ clock, trigger: 'tick' })
    const finishedAt = clock.now()
    return {
      jobName: job.name,
      startedAt,
      finishedAt,
      status: 'ok',
      message: null,
    }
  } catch (error) {
    // A background failure never stops the application or the public cache:
    // the error is recorded and execution continues.
    const finishedAt = clock.now()
    const message =
      error instanceof Error
        ? error.message
        : String(error ?? 'ismeretlen hiba')
    console.error(
      `[jobs] A(z) "${job.name}" háttérfeladat hibával zárult:`,
      message,
    )
    return {
      jobName: job.name,
      startedAt,
      finishedAt,
      status: 'error',
      message,
    }
  } finally {
    await lock.release()
  }
}

/** Default jobs: startup + hourly Authentik Tagcache sync. */
export function createDefaultSyncJobs(deps: RunnerDeps): JobDefinition[] {
  const syncOnce = async (trigger: SyncTrigger) => {
    await runMemberSync(trigger, deps)
  }
  return [
    {
      name: 'member-sync-startup',
      intervalMs: 'startup',
      run: () => syncOnce('startup'),
    },
    {
      name: 'member-sync-hourly',

      intervalMs: 60 * 60 * 1000,
      run: () => syncOnce('hourly'),
    },
  ]
}

export interface BackgroundRunnerHandle {
  registry: JobRegistry
  tickNow: () => Promise<JobRunRecord[]>
  stop: () => void
}

/**
 * Starts the background jobs: startup jobs once, then due interval jobs with
 * a per-minute check. The per-minute tick runs in real time; in tests it can
 * be driven via the `tickNow` call.
 */
export function startBackgroundRunner(
  deps: RunnerDeps = {},
  extraJobs: JobDefinition[] = [],
): BackgroundRunnerHandle {
  const registry = new JobRegistry()
  for (const job of [...createDefaultSyncJobs(deps), ...extraJobs]) {
    registry.register(job)
  }

  const executeAndMark = async (job: JobDefinition): Promise<JobRunRecord> => {
    const record = await runJobWithLock(job, deps)
    registry.setLastFinishedAt(job.name, record.finishedAt)
    return record
  }

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const scheduleNextTick = (): void => {
    if (stopped) {
      return
    }
    timer = setTimeout(() => {
      void tickAll().finally(scheduleNextTick)
    }, 60_000)
  }

  const tickAll = async (): Promise<JobRunRecord[]> => {
    const now = (deps.clock ?? systemClock).now()
    const due = dueJobs(registry, now)
    const records: JobRunRecord[] = []
    for (const job of due) {
      records.push(await executeAndMark(job))
    }
    return records
  }

  const handle: BackgroundRunnerHandle = {
    registry,
    tickNow: tickAll,
    stop: () => {
      stopped = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }

  void tickAll()
    .catch((error) => console.error('[jobs] Indulási tick hibás:', error))
    .finally(scheduleNextTick)

  return handle
}

/**
 * Leadership error band: the status of the most recent sync runs from the
 * persistent member_sync_runs table. Only leadership can request it.
 */
export async function getRecentSyncAlerts(
  viewer: Viewer,
  options: { db?: Database; limit?: number } = {},
): Promise<
  Array<{
    id: number
    trigger: string
    status: string
    startedAt: Date
    totalCount: number
    changedCount: number
    errorCount: number
    message: string | null
  }>
> {
  requireLeadership(viewer)
  const database = options.db ?? (await getDefaultDb())
  return database
    .select()
    .from(memberSyncRuns)
    .orderBy(desc(memberSyncRuns.id))
    .limit(options.limit ?? 10)
}
