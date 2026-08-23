import { and, desc, eq, lte, sql } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { liveStreams } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { writeAudit } from '#/server/shared/write.ts'
import type { JobDefinition } from '#/server/jobs/runner.ts'
import { validateYoutubeVideo } from '#/server/media/youtube.ts'

export class LiveOverlapError extends Error {
  constructor() {
    super(
      'Az időablak egymást átfedő live-ot tartalmazna. Válassz más kezdési és befejezési időt.',
    )
    this.name = 'LiveOverlapError'
  }
}

export interface LiveDeps {
  viewer: Viewer
  clock?: Clock
  fetchImpl?: typeof fetch
}

function assertLeadership(viewer: Viewer): void {
  if (!can.manageHomepageSettings(viewer)) {
    throw new ForbiddenError('A live beállítások kezelése vezetőségi jog.')
  }
}

async function loadStream(executor: Executor, id: string) {
  const rows = await executor
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, id))
    .limit(1)
  return rows.at(0) ?? null
}

/** Átfedés-ellenőrzés alkalmazásoldalon (a DB EXCLUDE korlát is védi). */
async function assertNoOverlap(
  executor: Executor,
  window: { startsAt: Date; endsAt: Date },
  options: { excludeId?: string } = {},
): Promise<void> {
  const conditions = [
    sql`${liveStreams.status} <> 'ended'`,
    lte(liveStreams.startsAt, window.endsAt),
    sql`${liveStreams.endsAt} >= ${window.startsAt}`,
  ]
  if (options.excludeId !== undefined) {
    conditions.push(sql`${liveStreams.id} <> ${options.excludeId}`)
  }
  const overlapping = await executor
    .select({ id: liveStreams.id })
    .from(liveStreams)
    .where(and(...conditions))
    .limit(1)
  if (overlapping.length > 0) {
    throw new LiveOverlapError()
  }
}

export interface CreateLiveInput {
  /** Bármely elfogadott YouTube URL-forma; normalizálásra kerül. */
  youtubeUrl: string
  startsAt: Date
  endsAt: Date
}

/**
 * Live ütemezése (spec 9.3): kötelező kezdés és befejezés, átfedés tiltva.
 * Mentéskor oEmbed ellenőrzés fut; a hibás azonosító nem menthető.
 */
export async function createLiveSchedule(
  executor: Executor,
  deps: LiveDeps,
  input: CreateLiveInput,
): Promise<typeof liveStreams.$inferSelect> {
  assertLeadership(deps.viewer)
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new Error('A befejezési időnek a kezdés után kell lennie.')
  }

  const check = await validateYoutubeVideo(
    input.youtubeUrl,
    {
      oEmbedEndpoint: 'https://www.youtube.com/oEmbed',
    },
    { fetchImpl: deps.fetchImpl },
  )
  if (!check.ok || check.videoId === null) {
    throw new Error(check.problems.join(' '))
  }

  await assertNoOverlap(executor, {
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  })

  const inserted = await executor
    .insert(liveStreams)
    .values({
      youtubeVideoId: check.videoId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: 'scheduled',
      createdBy: deps.viewer.sub,
    })
    .returning()
  const row = inserted.at(0)
  if (row === undefined) {
    throw new Error('A live ütemezés mentése nem sikerült.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: row.id,
    action: 'create',
    before: null,
    after: snapshotLive(row),
    occurredAt: (deps.clock ?? systemClock).now(),
  })
  return row
}

function snapshotLive(
  row: typeof liveStreams.$inferSelect,
): Record<string, unknown> {
  return {
    youtubeVideoId: row.youtubeVideoId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
  }
}

/** Ütemezett live időablakának módosítása; befejezett live már nem módosítható. */
export async function rescheduleLive(
  executor: Executor,
  deps: LiveDeps,
  liveId: string,
  input: { startsAt: Date; endsAt: Date },
): Promise<typeof liveStreams.$inferSelect> {
  assertLeadership(deps.viewer)
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new Error('A befejezési időnek a kezdés után kell lennie.')
  }

  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }
  if (current.status === 'ended') {
    // Korábbi live csak másolatként ütemezhető újra (spec 9.3).
    throw new Error(
      'Befejezett live nem módosítható; csak másolatként ütemezhető újra.',
    )
  }

  await assertNoOverlap(executor, input, { excludeId: liveId })

  const updated = await executor
    .update(liveStreams)
    .set({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updatedAt: (deps.clock ?? systemClock).now(),
    })
    .where(eq(liveStreams.id, liveId))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new Error('A live ütemezés módosítása nem sikerült.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'reschedule',
    before: snapshotLive(current),
    after: snapshotLive(row),
    occurredAt: (deps.clock ?? systemClock).now(),
  })
  return row
}

/**
 * `Indítás most` (spec 9.3): aktiváláskor oEmbed ellenőrzés fut; hibánál a
 * hiba rögzítésre kerül és a live ütemezetten marad (a homepage fallbacket mutat).
 */
export async function startLiveNow(
  executor: Executor,
  deps: LiveDeps & { youtubeConfig?: { oEmbedEndpoint: string } },
  liveId: string,
): Promise<{ stream: typeof liveStreams.$inferSelect; activated: boolean }> {
  assertLeadership(deps.viewer)

  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }

  const check = await validateYoutubeVideo(
    `https://www.youtube.com/watch?v=${current.youtubeVideoId}`,
    deps.youtubeConfig ?? { oEmbedEndpoint: 'https://www.youtube.com/oEmbed' },
    { fetchImpl: deps.fetchImpl },
  )
  const now = (deps.clock ?? systemClock).now()
  if (!check.ok) {
    // Fallback engedélyezett: a hiba rögzül, a live ütemezetten marad.
    const updated = await executor
      .update(liveStreams)
      .set({ activationError: check.problems.join(' '), updatedAt: now })
      .where(eq(liveStreams.id, liveId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new Error('A live állapota nem frissíthető.')
    }
    await writeAudit(executor, {
      actor: deps.viewer.sub ?? '',
      entityType: 'live_stream',
      entityId: liveId,
      action: 'activation_failed',
      before: snapshotLive(current),
      after: { error: row.activationError },
      occurredAt: now,
    })
    return { stream: row, activated: false }
  }

  await assertNoOverlap(
    executor,
    { startsAt: now, endsAt: current.endsAt },
    { excludeId: liveId },
  )

  const updated = await executor
    .update(liveStreams)
    .set({
      status: 'active',
      startsAt: now,
      activatedAt: now,
      activationError: null,
      updatedAt: now,
    })
    .where(eq(liveStreams.id, liveId))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new Error('A live állapota nem frissíthető.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'activate',
    before: snapshotLive(current),
    after: snapshotLive(row),
    occurredAt: now,
  })
  return { stream: row, activated: true }
}

/** `Lezárás most`: a live azonnal befejezett állapotba kerül. */
export async function endLiveNow(
  executor: Executor,
  deps: LiveDeps,
  liveId: string,
): Promise<typeof liveStreams.$inferSelect> {
  assertLeadership(deps.viewer)

  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }

  const now = (deps.clock ?? systemClock).now()
  const updated = await executor
    .update(liveStreams)
    .set({
      status: 'ended',
      endedAt: now,
      // Csak futó live esetén rövidül az ablak a lezárási időpontra;
      // a befejezés nem lehet korábbi a kezdésnél (DB check).
      ...(now > current.startsAt && now < current.endsAt
        ? { endsAt: now }
        : {}),
      updatedAt: now,
    })
    .where(eq(liveStreams.id, liveId))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new Error('A live állapota nem frissíthető.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'end',
    before: snapshotLive(current),
    after: snapshotLive(row),
    occurredAt: now,
  })
  return row
}

/** Ütemezett live törlése; aktív vagy befejezett nem törölhető. */
export async function deleteScheduledLive(
  executor: Executor,
  deps: LiveDeps,
  liveId: string,
): Promise<void> {
  assertLeadership(deps.viewer)
  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }
  if (current.status !== 'scheduled') {
    throw new Error('Csak ütemezett live törölhető.')
  }
  await executor.delete(liveStreams).where(eq(liveStreams.id, liveId))
  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'delete',
    before: snapshotLive(current),
    after: null,
    occurredAt: (deps.clock ?? systemClock).now(),
  })
}

/**
 * Háttérfeladat (spec 15): a lejárt ütemezések aktiválása/bezárása.
 * Csak tényleges változásnál ír auditot (`system` szereplővel).
 */
export async function transitionLiveStates(
  executor: Executor,
  options: { now: Date },
): Promise<{ activated: number; ended: number }> {
  let activated = 0
  let ended = 0

  const toActivate = await executor
    .select()
    .from(liveStreams)
    .where(
      and(
        sql`${liveStreams.status} = 'scheduled'`,
        lte(liveStreams.startsAt, options.now),
      ),
    )
  for (const stream of toActivate) {
    const updated = await executor
      .update(liveStreams)
      .set({
        status: 'active',
        activatedAt: options.now,
        updatedAt: options.now,
      })
      .where(
        and(eq(liveStreams.id, stream.id), eq(liveStreams.status, 'scheduled')),
      )
      .returning({ id: liveStreams.id })
    if (updated.length > 0) {
      activated += 1
      await writeAudit(executor, {
        actor: 'system',
        entityType: 'live_stream',
        entityId: stream.id,
        action: 'activate',
        before: snapshotLive(stream),
        after: { status: 'active' },
        occurredAt: options.now,
      })
    }
  }

  const toEnd = await executor
    .select()
    .from(liveStreams)
    .where(
      and(
        sql`${liveStreams.status} in ('scheduled','active')`,
        lte(liveStreams.endsAt, options.now),
      ),
    )
  for (const stream of toEnd) {
    const updated = await executor
      .update(liveStreams)
      .set({ status: 'ended', endedAt: stream.endsAt, updatedAt: options.now })
      .where(
        and(
          eq(liveStreams.id, stream.id),
          sql`${liveStreams.status} <> 'ended'`,
        ),
      )
      .returning({ id: liveStreams.id })
    if (updated.length > 0) {
      ended += 1
      await writeAudit(executor, {
        actor: 'system',
        entityType: 'live_stream',
        entityId: stream.id,
        action: 'end',
        before: snapshotLive(stream),
        after: { status: 'ended' },
        occurredAt: options.now,
      })
    }
  }

  return { activated, ended }
}

/** Admin előzmény: minden live legutóbbiekkel előre (publikus archívumba soha). */
/** Perces feladat a live állapotváltásokra (spec 15): a runner extra feladata. */
export function createLiveTransitionJob(deps: {
  clock?: Clock
  db: () => Promise<Executor>
}): JobDefinition {
  return {
    name: 'live-state-transitions',
    intervalMs: 60_000,
    run: async (ctx) => {
      const executor = await deps.db()
      await transitionLiveStates(executor, {
        now: (deps.clock ?? ctx.clock).now(),
      })
    },
  }
}

export async function listLiveHistory(
  executor: Executor,
  viewer: Viewer,
): Promise<Array<typeof liveStreams.$inferSelect>> {
  assertLeadership(viewer)
  return executor.select().from(liveStreams).orderBy(desc(liveStreams.startsAt))
}
