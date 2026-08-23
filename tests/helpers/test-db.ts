import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client, Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export interface TestDatabase {
  databaseName: string
  connectionString: string
  drop: () => Promise<void>
}

export function adminUrl(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'A TEST_DATABASE_URL környezeti változó nincs beállítva. Indítsd a fejlesztői PostgreSQL-t (docker compose -f docker-compose.dev.yml up -d bss-dev-db), és állítsd be: TEST_DATABASE_URL=postgres://bss:bss@127.0.0.1:5582/bss',
    )
  }
  return url
}

export async function createTestDatabase(
  prefix = 'bss_test',
): Promise<TestDatabase> {
  const admin = new Client({ connectionString: adminUrl() })
  await admin.connect()

  const databaseName = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`)

    const parsed = new URL(adminUrl())
    parsed.pathname = `/${databaseName}`
    const connectionString = parsed.toString()

    return {
      databaseName,
      connectionString,
      async drop() {
        await admin.query(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        )
        await admin.end()
      },
    }
  } catch (error) {
    await admin.end()
    throw error
  }
}

/** A drizzle/ könyvtár migrációit lefuttatja tiszta adatbázison. */
export async function applyDrizzleMigrations(executor: {
  query: Client['query']
}): Promise<void> {
  const drizzleDir = join(process.cwd(), 'drizzle')
  const folders = readdirSync(drizzleDir)
    .filter((name) => /^\d{14}_/.test(name))
    .sort()

  for (const folder of folders) {
    const sql = readFileSync(join(drizzleDir, folder, 'migration.sql'), 'utf-8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)

    for (const statement of statements) {
      await executor.query(statement)
    }
  }
}

export interface MigratedTestDatabase {
  database: TestDatabase
  pool: Pool
  db: NodePgDatabase<Record<string, never>>
}

/** Izolált, migrált adatbázist hoz létre integrációs tesztekhez. */
export async function createMigratedTestDatabase(
  prefix = 'bss_it',
): Promise<MigratedTestDatabase> {
  const database = await createTestDatabase(prefix)
  const pool = new Pool({ connectionString: database.connectionString })
  await applyDrizzleMigrations(pool)
  const db = drizzle({ client: pool })
  return { database, pool, db }
}
