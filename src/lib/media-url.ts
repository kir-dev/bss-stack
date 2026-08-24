/**
 * Kliensoldali média-URL ellenőrzés a mentés előtti figyelmeztetéshez
 * (spec 5.4). A tényleges kikényszerítés szerveroldalon marad
 * (`src/server/media/validator.ts`); ez csak korai visszajelzés a
 * szerkesztőben, hogy ne csak mentés után derüljön ki a hibás host.
 */

/** Ha az OOB config nem elérhető a kliensnek, a specifikált host a tartalék. */
export const DEFAULT_MEDIA_HOSTS = ['v.bsstudio.hu'] as const

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

/**
 * Magyar figyelmeztetés a mezőhöz, vagy `null`, ha az URL rendben van.
 * Az üres érték nem hiba: a videó URL nélkül is menthető piszkozatként.
 */
export function mediaUrlWarning(
  label: string,
  rawUrl: string,
  allowedHosts: readonly string[],
): string | null {
  const trimmed = rawUrl.trim()
  if (trimmed === '') {
    return null
  }
  const url = parseUrl(trimmed)
  if (url === null) {
    return `${label}: a megadott URL érvénytelen.`
  }
  if (url.protocol !== 'https:') {
    return `${label}: csak https:// URL adható meg.`
  }
  const hosts = allowedHosts.length > 0 ? allowedHosts : DEFAULT_MEDIA_HOSTS
  if (!hosts.includes(url.hostname)) {
    return `${label}: a(z) „${url.hostname}" host nem engedélyezett, csak ${hosts.join(', ')}. Piszkozatban mentheted, publikálni nem lehet vele.`
  }
  return null
}

/** A szerkesztő mindkét média mezőjének ellenőrzése egy listában. */
export function mediaUrlWarnings(
  fields: { videoUrl: string; thumbnailUrl: string },
  allowedHosts: readonly string[],
): string[] {
  return [
    mediaUrlWarning('MP4 URL', fields.videoUrl, allowedHosts),
    mediaUrlWarning('Thumbnail URL', fields.thumbnailUrl, allowedHosts),
  ].filter((warning): warning is string => warning !== null)
}
