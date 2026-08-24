/**
 * Kliensoldali listaszűrés szöveg alapján. Ékezetfüggetlen, hogy a magyar
 * nevek („Schönherz") ékezet nélkül írva is előkerüljenek.
 */

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('hu-HU')
    .trim()
}

/**
 * Igaz, ha a keresés minden szava szerepel a címkében (részszóként is).
 * Üres keresés mindenre illeszkedik.
 */
export function matchesSearch(label: string, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return true
  }
  const haystack = normalizeForSearch(label)
  return words.every((word) => haystack.includes(word))
}
