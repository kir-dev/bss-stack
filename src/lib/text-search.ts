/**
 * Client-side list filtering based on text. Accent-insensitive, so that
 * Hungarian names ("Schönherz") are also found when typed without accents.
 */

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('hu-HU')
    .trim()
}

/**
 * True if every word of the query appears in the label (also as a partial
 * word). An empty search matches everything.
 */
export function matchesSearch(label: string, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return true
  }
  const haystack = normalizeForSearch(label)
  return words.every((word) => haystack.includes(word))
}
