import { sql } from 'drizzle-orm'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getStartupMigrationState } from '#/db/migrate.ts'
import type { StartupMigrationState } from '#/db/migrate.ts'

export interface HealthStatus {
  status: 'ok' | 'error'
  database?: 'ok' | 'error' | 'unknown'
  migrations?: 'ok' | 'missing' | 'pending' | 'unknown'
}

/**
 * /health/live: signals that the application is running. It does not touch
 * the database and contains no configuration or secrets.
 */
export function livenessResponse(): Response {
  return jsonHealth({ status: 'ok' }, 200)
}

/**
 * /health/ready: database reachability and migration status.
 * The response contains only status fields, never error message details
 * or connection data (does not leak secrets).
 */
export async function readinessResponse(
  options: {
    db?: Database | null
    startupMigrations?: StartupMigrationState
  } = {},
): Promise<Response> {
  const status: HealthStatus = {
    status: 'error',
    database: 'unknown',
    migrations: 'unknown',
  }

  try {
    let database = options.db
    if (database === null || database === undefined) {
      database = await getDefaultDb()
    }
    await database.execute(sql`select 1`)
    status.database = 'ok'

    // Most tables already exist while a startup run applies newer migrations.
    const startupMigrations =
      options.startupMigrations ?? getStartupMigrationState()
    if (startupMigrations === 'running') {
      return jsonHealth({ ...status, migrations: 'pending' }, 503)
    }

    // The migration status can be checked via the presence of key tables:
    const requiredTables = [
      'videos',
      'events',
      'member_cache',
      'auth_sessions',
      'audit_log',
    ]
    const result = await database.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_name in ('videos','events','member_cache','auth_sessions','audit_log')`,
    )
    const rows: Array<{ table_name: string }> = (
      result as unknown as { rows: Array<{ table_name: string }> }
    ).rows
    const present = new Set(rows.map((row) => row.table_name))
    const migrationsOk = requiredTables.every((table) => present.has(table))
    if (!migrationsOk) {
      return jsonHealth(
        { ...status, status: 'error', migrations: 'missing' },
        503,
      )
    }
    return jsonHealth({ ...status, status: 'ok', migrations: 'ok' }, 200)
  } catch {
    // Deliberately no detailed error in the response.
    return jsonHealth({ ...status, status: 'error' }, 503)
  }
}

function jsonHealth(status: HealthStatus, httpStatus: number): Response {
  return new Response(JSON.stringify(status), {
    status: httpStatus,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}
