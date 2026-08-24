/** Publikus dátumformátum (spec 4.4): `2026. június 6.` — Europe/Budapest szerint. */
export function formatDateHu(date: Date): string {
  const parts = new Intl.DateTimeFormat('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).formatToParts(date)
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}. ${value('month')} ${Number(value('day'))}.`
}

/** Admin és audit formátum (spec 4.4): `2026. június 6. 14:32` — Europe/Budapest. */
export function formatAdminDateTimeHu(date: Date): string {
  const parts = new Intl.DateTimeFormat('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}. ${value('month')} ${Number(value('day'))}. ${value('hour')}:${value('minute')}`
}

const MONTHS = [
  'január',
  'február',
  'március',
  'április',
  'május',
  'június',
  'július',
  'augusztus',
  'szeptember',
  'október',
  'november',
  'december',
]

/**
 * Naptári dátum (időzóna nélküli `YYYY-MM-DD`) megjelenítése.
 * Az UTC mezőket külön kezeljük, hogy eltolás ne keletkezzen.
 */
export function formatCalendarDateHu(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (match === null) {
    return isoDate
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const monthName = MONTHS[month - 1] ?? ''
  return `${year}. ${monthName} ${day}.`
}

/** Eseményintervallum (spec 4.4): `2026. június 6-8.` vagy egynapos esetén sima dátum. */
export function formatEventIntervalHu(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate === null || endDate === '' || endDate === startDate) {
    return formatCalendarDateHu(startDate)
  }
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate)
  if (
    startMatch !== null &&
    endMatch !== null &&
    startMatch[1] === endMatch[1] &&
    startMatch[2] === endMatch[2]
  ) {
    const monthName = MONTHS[Number(startMatch[2]) - 1] ?? ''
    return `${startMatch[1]}. ${monthName} ${Number(startMatch[3])}-${Number(endMatch[3])}.`
  }
  return `${formatCalendarDateHu(startDate)} – ${formatCalendarDateHu(endDate)}`
}
