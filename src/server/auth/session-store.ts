import { and, eq, gt, lt } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { authSessions } from '#/db/schema.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import {
  hashSessionToken,
  newSessionToken,
  SESSION_TTL_MS,
} from './session-cookies.ts'

export type Database = NodePgDatabase<Record<string, never>>

export interface AuthSessionRecord {
  id: string
  memberSub: string
  username: string
  groups: string[]
  accessToken: string | null
  createdAt: Date
  expiresAt: Date
}

let defaultDbPromise: Promise<Database> | null = null

export function getDefaultDb(): Promise<Database> {
  if (defaultDbPromise === null) {
    defaultDbPromise = (async () => {
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'A DATABASE_URL környezeti változó nincs beállítva. Másold a .env.example alapú .env fájlba, vagy állítsd be explicit módon.',
        )
      }
      const module_ = await import('#/db/drizzleConnect.ts')
      return module_.db
    })()
  }
  return defaultDbPromise
}

export interface CreatedAuthSession {
  token: string
  session: AuthSessionRecord
}

export async function createAuthSession(
  identity: {
    memberSub: string
    username: string
    groups: string[]
    accessToken: string | null
  },
  options: {
    db?: Database
    clock?: Clock
    ttlMs?: number
  } = {},
): Promise<CreatedAuthSession> {
  const database = options.db ?? (await getDefaultDb())
  const clock = options.clock ?? systemClock
  const token = newSessionToken()
  const now = clock.now()
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? SESSION_TTL_MS))
  const id = hashSessionToken(token)

  await database.insert(authSessions).values({
    id,
    memberSub: identity.memberSub,
    username: identity.username,
    groups: identity.groups,
    accessToken: identity.accessToken,
    createdAt: now,
    expiresAt,
  })

  return {
    token,
    session: {
      id,
      memberSub: identity.memberSub,
      username: identity.username,
      groups: identity.groups,
      accessToken: identity.accessToken,
      createdAt: now,
      expiresAt,
    },
  }
}

export async function findActiveAuthSession(
  token: string,
  options: { db?: Database; clock?: Clock } = {},
): Promise<AuthSessionRecord | null> {
  if (token === '') {
    return null
  }
  const database = options.db ?? (await getDefaultDb())
  const clock = options.clock ?? systemClock

  const rows = await database
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, hashSessionToken(token)),
        gt(authSessions.expiresAt, clock.now()),
      ),
    )
    .limit(1)

  const row = rows.at(0)
  if (row === undefined) {
    return null
  }
  return {
    id: row.id,
    memberSub: row.memberSub,
    username: row.username,
    groups: row.groups,
    accessToken: row.accessToken,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }
}

export async function deleteAuthSession(
  token: string,
  options: { db?: Database } = {},
): Promise<void> {
  const database = options.db ?? (await getDefaultDb())
  await database
    .delete(authSessions)
    .where(eq(authSessions.id, hashSessionToken(token)))
}

export async function purgeExpiredAuthSessions(
  options: { db?: Database; clock?: Clock } = {},
): Promise<number> {
  const database = options.db ?? (await getDefaultDb())
  const clock = options.clock ?? systemClock
  const deleted = await database
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, clock.now()))
  return deleted.rowCount ?? 0
}
