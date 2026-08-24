/**
 * A „Felhasznált zenék" mező szerkezetes kezelése. Tárolásban továbbra is
 * egyetlen szöveg, soronként `Előadó - Szám címe` (spec 5.2), a szerkesztő
 * viszont két beviteli mezőre bontja, ha a meglévő tartalom értelmezhető.
 */

export interface SongEntry {
  artist: string
  title: string
}

/** Kötőjel-változatok: ezek a sor szétválasztói, ezért mezőben nem lehetnek. */
const DASHES = /[-–—]/
const DASHES_GLOBAL = /[-–—]/g
/** Szóközzel határolt kötőjel: ez a normál elválasztó. */
const SPACED_DASH = /\s+[-–—]\s+/g

function splitLine(line: string): SongEntry | null {
  const spaced = [...line.matchAll(SPACED_DASH)]
  if (spaced.length === 1) {
    const match = spaced[0]
    const artist = line.slice(0, match.index).trim()
    const title = line.slice(match.index + match[0].length).trim()
    return artist === '' || title === '' ? null : { artist, title }
  }
  if (spaced.length > 1) {
    // Több elválasztó: nem eldönthető, melyik a határ.
    return null
  }
  // Szóköz nélküli, egyetlen kötőjel (pl. „Artist-Title").
  const dashCount = (line.match(DASHES_GLOBAL) ?? []).length
  if (dashCount !== 1) {
    return null
  }
  const index = line.search(DASHES)
  const artist = line.slice(0, index).trim()
  const title = line.slice(index + 1).trim()
  return artist === '' || title === '' ? null : { artist, title }
}

/**
 * Sorok értelmezése előadó/cím párokra. `null`, ha bármelyik sor nem
 * értelmezhető — ilyenkor a szerkesztő a szabad szöveges mezőt használja,
 * hogy a meglévő tartalom ne sérüljön.
 */
export function parseSongList(raw: string): Array<SongEntry> | null {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const entries: Array<SongEntry> = []
  for (const line of lines) {
    const entry = splitLine(line)
    if (entry === null) {
      return null
    }
    entries.push(entry)
  }
  return entries
}

/**
 * Visszaírás a tárolt szöveges formába. A teljesen üres sorok kimaradnak, a
 * félig kitöltött sorból pedig nem lóg ki elválasztó kötőjel.
 */
export function serializeSongList(entries: ReadonlyArray<SongEntry>): string {
  return entries
    .map((entry) =>
      [entry.artist.trim(), entry.title.trim()].filter((part) => part !== ''),
    )
    .filter((parts) => parts.length > 0)
    .map((parts) => parts.join(' - '))
    .join('\n')
}

/** Kötőjelek eltávolítása: szerkezetes módban ezek az elválasztók. */
export function stripSongDashes(value: string): string {
  return value.replace(DASHES_GLOBAL, '')
}

/** Igaz, ha a szerkezetes módban tiltott karakter került a mezőbe. */
export function hasSongDash(value: string): boolean {
  return DASHES.test(value)
}
