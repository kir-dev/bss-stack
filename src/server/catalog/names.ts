const HUNGARIAN_ACCENTS: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ö: 'o',
  ő: 'o',
  ú: 'u',
  ü: 'u',
  ű: 'u',
  Á: 'a',
  É: 'e',
  Í: 'i',
  Ó: 'o',
  Ö: 'o',
  Ő: 'o',
  Ú: 'u',
  Ü: 'u',
  Ű: 'u',
}

/**
 * Katalógusnév normalizálása (spec 7.1): a kis- és nagybetű, valamint a
 * felesleges szóköz nem hozhat létre duplikációt. Az ékezet jelentésmegkülönböztető.
 */
export function normalizeCatalogName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Ékezetek lehajtogatása szóközök megtartásával (csak figyelmeztetéshez). */
export function foldAccents(value: string): string {
  return value.replace(
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g,
    (char) => HUNGARIAN_ACCENTS[char] ?? char,
  )
}

/**
 * Ékezeti hasonlóság (spec 7.1): az ékezet nélkül megegyező, de eltérő
 * normalizált nevek csak figyelmeztetést kapnak, nem blokkolnak.
 */
export function isAccentSimilar(a: string, b: string): boolean {
  const fa = foldAccents(normalizeCatalogName(a))
  const fb = foldAccents(normalizeCatalogName(b))
  return fa === fb && normalizeCatalogName(a) !== normalizeCatalogName(b)
}
