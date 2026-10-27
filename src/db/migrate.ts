import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

export const MIGRATIONS_FOLDER = 'drizzle'

// bigint key for pg_advisory_lock, derived the same way as the job locks.
export const MIGRATION_LOCK_KEY = (
  createHash('sha256').update('bss-migrations').digest().readBigUInt64BE(0) >>
  BigInt(1)
).toString()

/**
 * Applies the pending drizzle migrations. Instances starting together wait
 * for each other on an advisory lock, so only one of them migrates.
 */
export async function runMigrations(options: {
  connectionString: string
  migrationsFolder?: string
}): Promise<void> {
  const client = new Client({
    connectionString: options.connectionString,
    connectionTimeoutMillis: 10_000,
  })
  await client.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    await migrate(drizzle({ client }), {
      migrationsFolder: options.migrationsFolder ?? MIGRATIONS_FOLDER,
    })
  } finally {
    // Closing the session releases the advisory lock.
    await client.end()
  }
}

export type StartupMigrationState = 'idle' | 'running' | 'done'

let startupState: StartupMigrationState = 'idle'
let startupPromise: Promise<void> | null = null

/** Runs the migrations once per process; later calls return the same run. */
export function ensureStartupMigrations(): Promise<void> {
  if (startupPromise === null) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      return Promise.reject(
        new Error('A DATABASE_URL környezeti változó nincs beállítva.'),
      )
    }
    startupState = 'running'
    startupPromise = runMigrations({ connectionString }).then(() => {
      startupState = 'done'
    })
  }
  return startupPromise
}

export function getStartupMigrationState(): StartupMigrationState {
  return startupState
}
