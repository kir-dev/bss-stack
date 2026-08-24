import { getCachedOobConfig } from '#/server/config/load.ts'

/**
 * Engedélyezett média-hostok a kliensoldali, mentés előtti figyelmeztetéshez
 * (spec 5.4). Config nélkül üres lista megy ki, ilyenkor a kliens a
 * specifikált alap hostra esik vissza; a kikényszerítés szerveroldali marad
 * (`checkMediaUrlShape`).
 */
export function allowedMediaHosts(): string[] {
  try {
    return getCachedOobConfig().media.allowedHosts
  } catch {
    return []
  }
}
