import { slugify } from "../shared/slug"

export function normalizeCatalogName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}


export function isAccentSimilar(a: string, b: string): boolean {
  const fa = slugify(normalizeCatalogName(a))
  const fb = slugify(normalizeCatalogName(b))
  return fa === fb && normalizeCatalogName(a) !== normalizeCatalogName(b)
}
