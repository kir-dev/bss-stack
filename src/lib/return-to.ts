// A returnTo must stay on this site. Browsers drop tabs and newlines while
// parsing a URL, so "/\t/evil.com" would become the protocol-relative
// "//evil.com".
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

export function sanitizeReturnTo(raw: string | null): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    hasControlCharacter(raw)
  ) {
    return '/'
  }
  if (raw.length > 2048) {
    return '/'
  }
  return raw
}
