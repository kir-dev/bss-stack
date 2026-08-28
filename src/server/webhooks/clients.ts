import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { webhookClients } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { isUniqueViolation } from '#/server/shared/pg-error.ts'
import { TextValidationError } from '#/server/shared/text.ts'

function scryptAsync(
  secret: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keyLength, options, (error, derived) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derived)
    })
  })
}

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const SECRET_BYTES = 32

export const WEBHOOK_CLIENT_NAME_MAX = 200

/** Wrong or missing credentials on the ingest endpoint: always a 401. */
export class WebhookAuthError extends Error {
  constructor(message = 'Érvénytelen vagy hiányzó webhook hitelesítés.') {
    super(message)
    this.name = 'WebhookAuthError'
  }
}

export interface WebhookClientRecord {
  id: string
  name: string
  createdBy: string | null
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

/** A freshly minted secret: the plaintext is returned exactly once. */
export interface WebhookClientWithSecret {
  client: WebhookClientRecord
  /** `<clientId>.<secret>` — the full bearer token the client must send. */
  token: string
}

function toRecord(
  row: typeof webhookClients.$inferSelect,
): WebhookClientRecord {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  }
}

export function generateSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url')
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(secret, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

export async function verifySecret(
  secret: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false
  }
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  let derived: Buffer
  try {
    derived = await scryptAsync(secret, salt, expected.length, {
      N: n,
      r,
      p,
    })
  } catch {
    return false
  }
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  )
}

function validateName(name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TextValidationError(['Név: kötelező mező.'])
  }
  const trimmed = name.trim()
  if (trimmed.length > WEBHOOK_CLIENT_NAME_MAX) {
    throw new TextValidationError([
      `Név: legfeljebb ${WEBHOOK_CLIENT_NAME_MAX} karakter lehet (jelenlegi hossz: ${trimmed.length}).`,
    ])
  }
  return trimmed
}

export class WebhookClientNameConflictError extends Error {
  constructor(name: string) {
    super(`Már létezik "${name}" nevű webhook kliens.`)
    this.name = 'WebhookClientNameConflictError'
  }
}

export class WebhookClientNotFoundError extends Error {
  constructor() {
    super('A webhook kliens nem található.')
    this.name = 'WebhookClientNotFoundError'
  }
}

export async function createWebhookClient(
  executor: Executor,
  input: { name: unknown; createdBy: string | null },
): Promise<WebhookClientWithSecret> {
  const name = validateName(input.name)
  const secret = generateSecret()
  const secretHash = await hashSecret(secret)

  let row: typeof webhookClients.$inferSelect | undefined
  try {
    const inserted = await executor
      .insert(webhookClients)
      .values({ name, secretHash, createdBy: input.createdBy })
      .returning()
    row = inserted.at(0)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new WebhookClientNameConflictError(name)
    }
    throw error
  }
  if (row === undefined) {
    throw new Error('A webhook kliens létrehozása nem adott vissza sort.')
  }
  return { client: toRecord(row), token: `${row.id}.${secret}` }
}

export async function listWebhookClients(
  executor: Executor,
): Promise<WebhookClientRecord[]> {
  const rows = await executor
    .select()
    .from(webhookClients)
    .orderBy(desc(webhookClients.createdAt))
  return rows.map(toRecord)
}

/** Issues a new secret for an existing client; the old one stops working. */
export async function rotateWebhookClientSecret(
  executor: Executor,
  id: string,
): Promise<WebhookClientWithSecret> {
  const secret = generateSecret()
  const secretHash = await hashSecret(secret)
  const updated = await executor
    .update(webhookClients)
    .set({ secretHash, revokedAt: null })
    .where(eq(webhookClients.id, id))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new WebhookClientNotFoundError()
  }
  return { client: toRecord(row), token: `${row.id}.${secret}` }
}

export async function revokeWebhookClient(
  executor: Executor,
  id: string,
  now: Date,
): Promise<WebhookClientRecord> {
  const updated = await executor
    .update(webhookClients)
    .set({ revokedAt: now })
    .where(eq(webhookClients.id, id))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new WebhookClientNotFoundError()
  }
  return toRecord(row)
}

/** Hard delete; the client's delivery log rows go with it (ON DELETE CASCADE). */
export async function deleteWebhookClient(
  executor: Executor,
  id: string,
): Promise<void> {
  const deleted = await executor
    .delete(webhookClients)
    .where(eq(webhookClients.id, id))
    .returning({ id: webhookClients.id })
  if (deleted.length === 0) {
    throw new WebhookClientNotFoundError()
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolves `Authorization: Bearer <clientId>.<secret>` to a live client.
 * Revoked or unknown clients are indistinguishable from a wrong secret.
 */
export async function authenticateWebhookRequest(
  executor: Executor,
  request: Request,
  options: { now?: Date } = {},
): Promise<WebhookClientRecord> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (match === null) {
    throw new WebhookAuthError(
      'Hiányzó Authorization fejléc (Bearer <clientId>.<secret> formátum szükséges).',
    )
  }
  const separator = match[1].indexOf('.')
  if (separator <= 0) {
    throw new WebhookAuthError()
  }
  const clientId = match[1].slice(0, separator)
  const secret = match[1].slice(separator + 1)
  if (secret === '' || !UUID_PATTERN.test(clientId)) {
    throw new WebhookAuthError()
  }

  const rows = await executor
    .select()
    .from(webhookClients)
    .where(eq(webhookClients.id, clientId))
    .limit(1)
  const row = rows.at(0)
  if (row === undefined || row.revokedAt !== null) {
    throw new WebhookAuthError()
  }
  if (!(await verifySecret(secret, row.secretHash))) {
    throw new WebhookAuthError()
  }

  await executor
    .update(webhookClients)
    .set({ lastUsedAt: options.now ?? new Date() })
    .where(eq(webhookClients.id, row.id))

  return toRecord(row)
}
