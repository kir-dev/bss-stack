import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core'

/**
 * Common executor type: both the full database connection AND the tx object
 * inside a transaction can be used for select/insert/update calls.
 */
export type Executor = PgAsyncDatabase<
  NodePgQueryResultHKT,
  Record<string, never>
>
