import { getCachedOobConfig } from '#/server/config/load.ts'

/**
 * Allowed media hosts for the client-side, pre-save warning (spec 5.4).
 * Without a config an empty list is sent, in which case the client falls
 * back to the specified default host; enforcement stays server-side
 * (`checkMediaUrlShape`).
 */
export function allowedMediaHosts(): string[] {
  try {
    return getCachedOobConfig().media.allowedHosts
  } catch {
    return []
  }
}
