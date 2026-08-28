/**
 * Display label for the canonical `YYYY/YYYY/N` semester notation:
 * `2020/2021/1` → `2020 ősz`, `2020/2021/2` → `2021 tavasz`.
 *
 * A pure client-safe counterpart of `parseAcademicSemester`; unparsable input is
 * returned unchanged so a stray legacy value still shows up on the profile.
 */
export function formatAcademicSemesterHu(value: string): string {
  const match = /^(\d{4})\/(\d{4})\/([12])$/.exec(value.trim())
  if (match === null) {
    return value
  }
  return match[3] === '1' ? `${match[1]} ősz` : `${match[2]} tavasz`
}
