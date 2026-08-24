import { readFileSync } from 'node:fs'
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { loadOobConfig } from '#/server/config/load.ts'
import { importSeed } from '#/server/seed/importer.ts'
import { SeedValidationError, validateSeedJson } from '#/server/seed/schema.ts'

/**
 * Seed importer CLI (BSS-034): a OOB config `seed.path` mezőjében rögzített
 * JSON-t tölti be idempotensen a DATABASE_URL adatbázisba.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(
      'A DATABASE_URL környezeti változó nincs beállítva. ' +
        'Állítsd be a .env fájlban (lásd .env.example), majd futtasd újra: pnpm db:seed',
    )
    process.exit(1)
  }

  const config = loadOobConfig()
  const seedPath = config.seed.path

  let rawSeed: unknown
  try {
    rawSeed = JSON.parse(readFileSync(seedPath, 'utf-8'))
  } catch (error) {
    console.error(
      `Nem olvasható a seed JSON: ${seedPath}. ` +
        'Helyét az OOB config seed.path mezője rögzíti; a tartalmát a scraper állítja elő (docs/oob-inputs.md). ' +
        `Eredeti hiba: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }

  let seed
  try {
    seed = validateSeedJson(rawSeed, config.media)
  } catch (error) {
    if (error instanceof SeedValidationError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const db = drizzle({ client: pool })
    const result = await importSeed(db, { seed })
    console.log('A seed betöltése sikeres.')
    console.log(
      `  Események: ${result.createdEvents} új, ${result.updatedEvents} frissített`,
    )
    console.log(`  Címkék: ${result.createdTags} új`)
    console.log(`  Stábszerepek: ${result.createdStaffRoles} új`)
    console.log(
      `  Videók: ${result.createdVideos} új, ${result.updatedVideos} frissített`,
    )
    console.log(
      `  Kapcsolatok: ${result.tagLinks} címke-, ${result.staffLinks} stábkapcsolat`,
    )
    console.log(
      'Újrafuttatás biztonságos: a változatlan adatokra nem ír semmit.',
    )
  } catch (error) {
    console.error((error as Error).message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

void main()
