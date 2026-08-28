import { getCachedOobConfig } from '#/server/config/load.ts'

export function allowedMediaHosts(): string[] {
  try {
    return getCachedOobConfig().media.allowedHosts
  } catch {
    return []
  }
}
