/**
 * Last path segment of a member's profile URL: the Authentik username once the
 * member has logged in, the `sub` until then.
 */
export function memberSlug(member: {
  sub: string
  username: string | null
}): string {
  return member.username ?? member.sub
}

/**
 * `.` and `..` cannot end a profile URL: browsers resolve them (even as `%2E`)
 * to another page, so such a name is never used as a slug.
 */
export function isDotSegment(value: string): boolean {
  return value === '.' || value === '..'
}

/**
 * Profile path with the slug URL-encoded, the same form router links produce:
 * the `sub` and the username arrive unchecked from outside.
 */
export function memberProfilePath(member: {
  sub: string
  username: string | null
}): string {
  return `/members/${encodeURIComponent(memberSlug(member))}`
}
