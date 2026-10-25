import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { memberCache } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { isDotSegment } from '#/lib/member-slug.ts'

/**
 * Stores the Authentik `preferred_username` on the member profile at login; the
 * webhook does not carry it. A name already held by another profile (e.g. a
 * migrated legacy account) is left with its holder, so this never fails the
 * unique index. Unknown `sub`s are a no-op: profiles come from the webhook only.
 * A `.` or `..` username is not stored; the profile keeps its `sub` slug.
 */
export async function syncMemberUsername(
  executor: Executor,
  sub: string,
  username: string,
  now: Date,
): Promise<void> {
  if (isDotSegment(username)) {
    return
  }
  await executor
    .update(memberCache)
    .set({ username, updatedAt: now })
    .where(
      and(
        eq(memberCache.sub, sub),
        or(isNull(memberCache.username), ne(memberCache.username, username)),
        sql`not exists (select 1 from ${memberCache} other where other.username = ${username} and other.sub <> ${sub})`,
      ),
    )
}
