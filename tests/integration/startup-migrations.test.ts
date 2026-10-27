import { readdirSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import {
  ensureStartupMigrations,
  getStartupMigrationState,
  MIGRATION_LOCK_KEY,
  MIGRATIONS_FOLDER,
  runMigrations,
} from '#/db/migrate.ts'
import { createTestDatabase } from '../helpers/test-db.ts'
import type { TestDatabase } from '../helpers/test-db.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

const databases: TestDatabase[] = []

afterAll(async () => {
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

const migrationCount = readdirSync(MIGRATIONS_FOLDER).filter((name) =>
  /^\d{14}_/.test(name),
).length

async function appliedMigrations(connectionString: string): Promise<number> {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const result = await client.query<{ count: string }>(
      'select count(*) from drizzle.__drizzle_migrations',
    )
    return Number(result.rows[0].count)
  } finally {
    await client.end()
  }
}

describe.skipIf(!hasTestDatabase)('induláskori migráció', () => {
  it('tiszta adatbázison minden migrációt lefuttat, újrafuttatva nem tesz semmit', async () => {
    const database = await createTestDatabase('bss_startup_migrate')
    databases.push(database)
    const { connectionString } = database

    await runMigrations({ connectionString })
    expect(await appliedMigrations(connectionString)).toBe(migrationCount)

    await runMigrations({ connectionString })
    expect(await appliedMigrations(connectionString)).toBe(migrationCount)
  })

  it('két egyszerre induló példány sem ütközik', async () => {
    const database = await createTestDatabase('bss_startup_concurrent')
    databases.push(database)
    const { connectionString } = database

    await Promise.all([
      runMigrations({ connectionString }),
      runMigrations({ connectionString }),
    ])
    expect(await appliedMigrations(connectionString)).toBe(migrationCount)
  })

  it('megvárja, amíg egy másik példány elengedi a zárat', async () => {
    const database = await createTestDatabase('bss_startup_lock')
    databases.push(database)
    const { connectionString } = database

    const holder = new Client({ connectionString })
    await holder.connect()
    await holder.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])

    let finished = false
    const run = runMigrations({ connectionString }).then(() => {
      finished = true
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(finished).toBe(false)

    await holder.end()
    await run
    expect(await appliedMigrations(connectionString)).toBe(migrationCount)
  })

  it('az induláskori futás állapota idle, running, majd done', async () => {
    const database = await createTestDatabase('bss_startup_state')
    databases.push(database)
    const previousUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = database.connectionString

    try {
      expect(getStartupMigrationState()).toBe('idle')
      const run = ensureStartupMigrations()
      expect(getStartupMigrationState()).toBe('running')
      expect(ensureStartupMigrations()).toBe(run)
      await run
      expect(getStartupMigrationState()).toBe('done')
    } finally {
      if (previousUrl === undefined) {
        delete process.env.DATABASE_URL
      } else {
        process.env.DATABASE_URL = previousUrl
      }
    }
  })
})
