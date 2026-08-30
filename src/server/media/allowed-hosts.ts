import { getCachedOobConfig } from '#/server/config/load.ts'

export function allowedMediaHosts(): string[] {
  return [...getCachedOobConfig().media.allowedHosts]
}
