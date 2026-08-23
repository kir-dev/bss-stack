import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core'

/**
 * Közös végrehajtó típus: a teljes adatbázis-kapcsolat ÉS a tranzakción belüli
 * tx objektum egyaránt használható select/insert/update hívásokra.
 */
export type Executor = PgAsyncDatabase<
  NodePgQueryResultHKT,
  Record<string, never>
>
