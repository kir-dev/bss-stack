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
