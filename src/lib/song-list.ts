/**
 * Structured handling of the "Used songs" field. In storage it remains a
 * single text, one `Artist - Song title` per line (spec 5.2), while the
 * editor splits it into two input fields when the existing content is
 * interpretable.
 */

export interface SongEntry {
  artist: string
  title: string
}

/** Dash variants: these are line separators, so they cannot appear within a field. */
const DASHES = /[-–—]/
const DASHES_GLOBAL = /[-–—]/g
/** Whitespace-surrounded dash: this is the normal separator. */
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
    // Multiple separators: it can't be determined which one is the boundary.
    return null
  }
  // A single dash without surrounding whitespace (e.g. "Artist-Title").
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
 * Interprets lines into artist/title pairs. Returns `null` if any line is
 * not interpretable — in that case the editor falls back to the free-text
 * field so that the existing content isn't damaged.
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
 * Serializes back into the stored text form. Completely empty rows are
 * omitted, and a half-filled row never leaks a separating dash.
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

/** Removes dashes: in structured mode these are the separators. */
export function stripSongDashes(value: string): string {
  return value.replace(DASHES_GLOBAL, '')
}

/** True if a character forbidden in structured mode got into the field. */
export function hasSongDash(value: string): boolean {
  return DASHES.test(value)
}
