import { Client } from 'pg'

export interface TestDatabase {
  databaseName: string
  connectionString: string
  drop: () => Promise<void>
}

function adminUrl(): string {
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
