import { afterAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { createTestDatabase } from '../helpers/test-db.ts'
import type { TestDatabase } from '../helpers/test-db.ts'

const databases: TestDatabase[] = []

afterAll(async () => {
  while (databases.length > 0) {
    await databases.pop()!.drop()
  }
})

function withIsolatedDatabase(
  run: (database: TestDatabase) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const database = await createTestDatabase()
    databases.push(database)
    const client = new Client({ connectionString: database.connectionString })
    await client.connect()
    try {
      await run(database)
    } finally {
      await client.end()
    }
  }
}

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!hasTestDatabase)(
  'integrációs smoke test valódi PostgreSQL ellen',
  () => {
    it(
      'izolált tesztadatbázist hoz létre és kérdez le',
      withIsolatedDatabase(async (database) => {
        expect(database.databaseName).toMatch(/^bss_test_/)

        const client = new Client({
          connectionString: database.connectionString,
        })
        await client.connect()
        try {
          await client.query(
            'CREATE TABLE smoke_check (id integer primary key, label text)',
          )
          await client.query(
            "INSERT INTO smoke_check (id, label) VALUES (1, 'működik')",
          )
          const result = await client.query<{ label: string }>(
            'SELECT label FROM smoke_check WHERE id = 1',
          )
          expect(result.rows[0]?.label).toBe('működik')
        } finally {
          await client.end()
        }
      }),
    )

    it(
      'minden teszt tiszta, egymástól független adatbázison fut',
      withIsolatedDatabase(async (database) => {
        const client = new Client({
          connectionString: database.connectionString,
        })
        await client.connect()
        try {
          const exists = await client.query(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'smoke_check'",
          )
          expect(exists.rowCount).toBe(0)
        } finally {
          await client.end()
        }
      }),
    )
  },
)
