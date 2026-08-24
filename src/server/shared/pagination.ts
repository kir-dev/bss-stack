/**
 * Interpretation of pagination parameters. The value arriving from the URL may
 * be a number (`?page=2`) or a string (`?page="2"`) depending on the serializer,
 * so we accept both; an invalid or missing value falls back to the default.
 */
export function parsePaginationNumber(
  value: unknown,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    if (parsed > 0) {
      return parsed
    }
  }
  return fallback
}

/**
 * Page number from the URL search parameters. TanStack Router's default
 * serializer returns `2` as a number and `"2"` as a string, so both must be
 * accepted. The first page is `undefined` so that it does not unnecessarily
 * end up in the URL.
 */
export function parseSearchPage(value: unknown): number | undefined {
  const page = parsePaginationNumber(value, 1)
  return page > 1 ? page : undefined
}
