export interface PgErrorInfo {
  code: string
  constraint: string | null
}

const MAX_CAUSE_DEPTH = 5

/**
 * Digs the PostgreSQL error code out of a thrown value.
 * Drizzle wraps driver errors in a `DrizzleQueryError`, so the `code` and
 * `constraint` fields live on `cause` rather than on the error itself.
 */
export function pgErrorInfo(error: unknown): PgErrorInfo | null {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return null
    }
    const record = current as {
      code?: unknown
      constraint?: unknown
      cause?: unknown
    }
    if (typeof record.code === 'string') {
      return {
        code: record.code,
        constraint:
          typeof record.constraint === 'string' ? record.constraint : null,
      }
    }
    current = record.cause
  }
  return null
}

/** True for a unique-index violation (SQLSTATE 23505), optionally on a named index. */
export function isUniqueViolation(
  error: unknown,
  constraintContains?: string,
): boolean {
  const info = pgErrorInfo(error)
  if (info === null || info.code !== '23505') {
    return false
  }
  if (constraintContains === undefined) {
    return true
  }
  return (info.constraint ?? '').includes(constraintContains)
}
