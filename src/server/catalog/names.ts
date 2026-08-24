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
 * Normalize a catalog name (spec 7.1): letter case and superfluous
 * whitespace must not create duplicates. Accents are meaning-distinguishing.
 */
export function normalizeCatalogName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Fold accents while preserving whitespace (only used for warnings). */
export function foldAccents(value: string): string {
  return value.replace(
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g,
    (char) => HUNGARIAN_ACCENTS[char] ?? char,
  )
}

/**
 * Accent similarity (spec 7.1): normalized names that match when accents
 * are folded but otherwise differ only produce a warning, not a block.
 */
export function isAccentSimilar(a: string, b: string): boolean {
  const fa = foldAccents(normalizeCatalogName(a))
  const fb = foldAccents(normalizeCatalogName(b))
  return fa === fb && normalizeCatalogName(a) !== normalizeCatalogName(b)
}
