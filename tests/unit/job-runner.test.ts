import { afterAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { FakeClock } from '#/lib/clock.ts'
import {
  dueJobs,
  JobRegistry,
  runJobWithLock,
  startBackgroundRunner,
} from '#/server/jobs/runner.ts'
import type { JobDefinition, RunnerDeps } from '#/server/jobs/runner.ts'
import {
  createPgLockManager,
  createPermissiveLockManager,
} from '#/server/jobs/locks.ts'
import type { LockManager } from '#/server/jobs/locks.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const databases: Array<{ drop: () => Promise<void> }> = []
const poolCleanups: Array<() => Promise<void>> = []
const lockManagers: LockManager[] = []

afterAll(async () => {
  while (poolCleanups.length > 0) {
    await poolCleanups.pop()!()
  }
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
  for (const manager of lockManagers) {
    await manager.close?.()
  }
})

function makeJob(
  name: string,
  intervalMs: number | 'startup',
  run?: JobDefinition['run'],
): JobDefinition {
  return {
    name,
    intervalMs,
    run:
      run ??
      (async () => {
        void undefined
      }),
  }
}

describe('BSS-010: ütemezési logika (FakeClock-kal vezérelt)', () => {
  it('startup feladat csak egyszer fut; az óránkénti a következő óra határán esedékes', async () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    const registry = new JobRegistry()
    let startupRuns = 0
    let hourlyRuns = 0

    registry.register(
      makeJob('startup-job', 'startup', async () => {
        startupRuns += 1
      }),
    )
    registry.register(
      makeJob('hourly-job', 60 * 60 * 1000, async () => {
        hourlyRuns += 1
      }),
    )

    // induláskor mindkettő esedékes
    expect(dueJobs(registry, clock.now()).map((job) => job.name)).toEqual([
      'startup-job',
      'hourly-job',
    ])
    for (const job of dueJobs(registry, clock.now())) {
      await job.run({ clock, trigger: 'tick' })
      registry.setLastFinishedAt(job.name, clock.now())
    }

    // perc múlva semmi sem esedékes
    clock.advanceMinutes(1)
    expect(dueJobs(registry, clock.now())).toHaveLength(0)
    expect(dueJobs(registry, clock.now()).length).toBe(0)

    // óra múlva csak az óránkénti
    clock.advanceMinutes(60)
    const dueAfterHour = dueJobs(registry, clock.now())
    expect(dueAfterHour.map((job) => job.name)).toEqual(['hourly-job'])

    expect(startupRuns).toBe(1)
    expect(hourlyRuns).toBe(1)
  })

  it('a regisztrált feladatok futtatása hibátlanul működik a tesztórával', async () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    const registry = new JobRegistry()
    const executedAt: Date[] = []
    registry.register(
      makeJob('napi-takaritas', 24 * 60 * 60 * 1000, async (ctx) => {
        executedAt.push(ctx.clock.now())
      }),
    )

    await registry.getJob('napi-takaritas')!.run({ clock, trigger: 'tick' })
    clock.advanceDays(2)
    await registry.getJob('napi-takaritas')!.run({ clock, trigger: 'tick' })

    expect(executedAt).toEqual([
      new Date('2026-06-01T10:00:00.000Z'),
      new Date('2026-06-03T10:00:00.000Z'),
    ])
  })
})

describe('BSS-010: háttérhiba nem állítja le az alkalmazást', () => {
  it('hibás feladat error rekordot ad, de nem dob ki', async () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    const failing = makeJob('failing-job', 'startup', async () => {
      throw new Error('szimulált háttérhiba')
    })

    const record = await runJobWithLock(failing, {
      clock,
      lockManager: createPermissiveLockManager(),
    })
    expect(record.status).toBe('error')
    expect(record.message).toContain('szimulált háttérhiba')

    // a runner ezután is futtat további feladatokat
    const healthy = makeJob('healthy-job', 'startup')
    const okRecord = await runJobWithLock(healthy, {
      clock,
      lockManager: createPermissiveLockManager(),
    })
    expect(okRecord.status).toBe('ok')
  })
})

describe.skipIf(!hasTestDatabase)('BSS-010: PostgreSQL advisory lock', () => {
  it('két példány közül csak az egyik szerzi meg a lockot', async () => {
    const managerA = createPgLockManager({
      clientFactory: async () =>
        new Client({ connectionString: process.env.TEST_DATABASE_URL! }),
    })
    const managerB = createPgLockManager({
      clientFactory: async () =>
        new Client({ connectionString: process.env.TEST_DATABASE_URL! }),
    })
    lockManagers.push(managerA, managerB)

    const first = await managerA.acquire('member-sync-hourly')
    expect(first).not.toBeNull()

    const second = await managerB.acquire('member-sync-hourly')
    expect(second).toBeNull()

    // felszabadítás után a másik is hozzájut
    await first!.release()
    const third = await managerB.acquire('member-sync-hourly')
    expect(third).not.toBeNull()
    await third!.release()

    for (const client of [managerA, managerB]) {
      void client
    }
  })

  it('runJobWithLock skipped-locked eredményt ad, ha más tartja a lockot', async () => {
    const clock = new FakeClock('2026-06-01T10:00:00.000Z')
    let executions = 0
    const job = makeJob('locked-job', 'startup', async () => void ++executions)

    const instanceA = createPgLockManager({
      clientFactory: async () =>
        new Client({ connectionString: process.env.TEST_DATABASE_URL! }),
    })
    const instanceB = createPgLockManager({
      clientFactory: async () =>
        new Client({ connectionString: process.env.TEST_DATABASE_URL! }),
    })
    lockManagers.push(instanceA, instanceB)
    const held = await instanceA.acquire('locked-job')

    // A B példány (külön kapcsolat) nem futtathatja, amíg A tartja:
    const record = await runJobWithLock(job, { clock, lockManager: instanceB })
    expect(record.status).toBe('skipped-locked')
    expect(executions).toBe(0)

    await held!.release()
    const secondAttempt = await runJobWithLock(job, {
      clock,
      lockManager: instanceB,
    })
    expect(secondAttempt.status).toBe('ok')
    expect(executions).toBe(1)
  })
})

describe('BSS-010: háttérfeladatok regisztrációja', () => {
  it('alapértelmezetten egyetlen feladat sincs regisztrálva', () => {
    const handle = startBackgroundRunner({
      lockManager: createPermissiveLockManager(),
    })
    try {
      expect(handle.registry.list()).toHaveLength(0)
    } finally {
      handle.stop()
    }
  })

  it('extra feladatok is regisztrálhatók (lomtár, live időzítő előkészület)', () => {
    const extra: JobDefinition = makeJob(
      'trash-purge-daily',
      24 * 60 * 60 * 1000,
    )
    const deps: RunnerDeps = { lockManager: createPermissiveLockManager() }
    const handle = startBackgroundRunner(deps, [extra])
    try {
      expect(handle.registry.getJob('trash-purge-daily')).toBeDefined()
    } finally {
      handle.stop()
    }
  })
})
