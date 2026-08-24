import { Client } from 'pg'
import { createHash } from 'node:crypto'

/**
 * PostgreSQL advisory lock (spec 15): of two application instances only one
 * can run the given job at a time. The lock is bound to a dedicated
 * connection, so the release happens on the same connection.
 */

export interface AdvisoryLock {
  release: () => Promise<void>
}

function lockKeyFor(name: string): string {
  // bigint key from the hash of the job name (pg_try_advisory_lock is 63-bit)
  const hash = createHash('sha256').update(`bss-job:${name}`).digest()
  const value = hash.readBigUInt64BE(0) >> BigInt(1) // truncate to 63 bits
  return value.toString()
}

async function getDefaultLockClient(): Promise<Client> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'A DATABASE_URL környezeti változó nincs beállítva. Másold a .env.example alapú .env fájlba, vagy állítsd be explicit módon.',
    )
  }
  const client = new Client({ connectionString: url })
  await client.connect()
  return client
}

export interface LockManager {
  acquire: (name: string) => Promise<AdvisoryLock | null>
  close?: () => Promise<void>
}

export function createPgLockManager(
  options: { clientFactory?: () => Promise<Client> } = {},
): LockManager {
  let sharedClient: Client | null = null

  async function getClient(): Promise<Client> {
    if (sharedClient === null) {
      sharedClient = await (options.clientFactory ?? getDefaultLockClient)()
      await sharedClient.connect().catch((error) => {
        // Errors indicating an already-connected client are harmless.
        void error
      })
    }
    return sharedClient
  }

  return {
    async acquire(name) {
      const key = lockKeyFor(name)
      const client = await getClient()
      const result = await client.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1) as locked',
        [key],
      )
      if (result.rows[0]?.locked !== true) {
        return null
      }
      return {
        release: async () => {
          await client.query('select pg_advisory_unlock($1)', [key])
        },
      }
    },
    async close() {
      if (sharedClient !== null) {
        await sharedClient.end()
        sharedClient = null
      }
    },
  }
}

/** For tests: an always-permissive lock manager. */
export function createPermissiveLockManager(): LockManager {
  return {
    acquire: async () => ({ release: async () => undefined }),
  }
}
