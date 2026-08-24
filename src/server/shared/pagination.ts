/**
 * Lapozási paraméterek értelmezése. Az URL-ből érkező érték a szerializálótól
 * függően szám (`?page=2`) vagy szöveg (`?page="2"`) is lehet, ezért mindkettőt
 * elfogadjuk; érvénytelen vagy hiányzó érték az alapértelmezésre esik vissza.
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
 * Oldalszám az URL keresési paraméterekből. A TanStack Router alapértelmezett
 * szerializálója a `2`-t számként, a `"2"`-t szövegként adja vissza, ezért
 * mindkettőt el kell fogadni. Az első oldal `undefined`, hogy ne kerüljön
 * feleslegesen az URL-be.
 */
export function parseSearchPage(value: unknown): number | undefined {
  const page = parsePaginationNumber(value, 1)
  return page > 1 ? page : undefined
}
