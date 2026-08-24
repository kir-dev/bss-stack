import { afterAll, describe, expect, it } from 'vitest'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { livenessResponse, readinessResponse } from '#/server/jobs/health.ts'
import { createMigratedTestDatabase } from '../helpers/test-db.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const databases: Array<{ drop: () => Promise<void> }> = []
const poolCleanups: Array<() => Promise<void>> = []

afterAll(async () => {
  while (poolCleanups.length > 0) {
    await poolCleanups.pop()!()
  }
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

describe.skipIf(!hasTestDatabase)('BSS-010: health végpontok', () => {
  it('/health/live mindig ok, adatbázis nélkül is', () => {
    const response = livenessResponse()
    expect(response.status).toBe(200)
    return response.text().then((body) => {
      expect(JSON.parse(body)).toEqual({ status: 'ok' })
    })
  })

  it('/health/ready migrált adatbázissal ok', async () => {
    const migrated = await createMigratedTestDatabase('bss_health')
    databases.push(migrated.database)
    poolCleanups.push(() => migrated.pool.end())

    const response = await readinessResponse({
      db: migrated.db,
    })
    expect(response.status).toBe(200)
    const body = JSON.parse(await response.text()) as Record<string, unknown>
    expect(body['status']).toBe('ok')
    expect(body['database']).toBe('ok')
    expect(body['migrations']).toBe('ok')
  })

  it('elérhetetlen adatbázisnál 503, titkok és részletes hiba nélkül', async () => {
    const response = await readinessResponse({
      db: undefined as unknown as NodePgDatabase<Record<string, never>>,
    })
    expect(response.status).toBe(503)
    const body = await response.text()
    // Nem szivárogtat kapcsolati stringet, jelszót vagy veremnyomot:
    expect(body).not.toContain('postgres://')
    expect(body).not.toContain('password')
    expect(body).not.toContain('DATABASE_URL')
    expect(body).not.toContain('at ')
  })

  it('migrálatlan adatbázisnál migrations=missing és 503', async () => {
    const migrated = await createMigratedTestDatabase('bss_health_raw')
    databases.push(migrated.database)
    poolCleanups.push(() => migrated.pool.end())
    await migrated.pool.query('DROP TABLE IF EXISTS auth_sessions CASCADE')

    const response = await readinessResponse({ db: migrated.db })
    expect(response.status).toBe(503)
    const body = JSON.parse(await response.text()) as Record<string, unknown>
    expect(body['database']).toBe('ok')
    expect(body['migrations']).toBe('missing')
  })
})
