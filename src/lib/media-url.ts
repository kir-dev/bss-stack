/** If the OOB config is not available to the client, this host is the fallback. */
export const DEFAULT_MEDIA_HOSTS = ['v.bsstudio.hu'] as const

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

/**
 * Validation warning for the field, or `null` if the URL is fine.
 * An empty value is not an error: the video can be saved as a draft
 * even without a URL.
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
    return `${label}: a(z) „${url.hostname}" host nem engedélyezett, csak ${hosts.join(', ')}.`
  }
  return null
}

/** Validation of both media fields in the editor, returned as a list. */
export function mediaUrlWarnings(
  fields: { videoUrl: string; thumbnailUrl: string },
  allowedHosts: readonly string[],
): string[] {
  return [
    mediaUrlWarning('MP4 URL', fields.videoUrl, allowedHosts),
    mediaUrlWarning('Thumbnail URL', fields.thumbnailUrl, allowedHosts),
  ].filter((warning): warning is string => warning !== null)
}
