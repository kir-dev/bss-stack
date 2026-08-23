import { sql } from 'drizzle-orm'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'

export interface HealthStatus {
  status: 'ok' | 'error'
  database?: 'ok' | 'error' | 'unknown'
  migrations?: 'ok' | 'missing' | 'unknown'
}

/**
 * /health/live: az alkalmazás futását jelzi. Nem nyúl adatbázishoz és
 * nem tartalmaz semmilyen konfigurációt vagy titkot.
 */
export function livenessResponse(): Response {
  return jsonHealth({ status: 'ok' }, 200)
}

/**
 * /health/ready: adatbázis-elérhetőség és migrációk állapota.
 * A válasz csak állapotmezőket tartalmaz, soha nem hibaüzenet-részleteket
 * vagy kapcsolati adatokat (nem szivárogtat titkot).
 */
export async function readinessResponse(
  options: { db?: Database | null } = {},
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

    // A migrációk állapota a kulcstáblák meglétével ellenőrizhető:
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
    // Szándékosan nincs részletes hiba a válaszban.
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
