import { loadOobConfig } from '#/server/config/load.ts'

const path: string | undefined =
  process.argv.length > 2 ? process.argv[2] : undefined

try {
  const config = loadOobConfig(path)
  console.log('A BSS OOB config érvényes.')
  console.log(
    `  Betöltött fájl: ${path ?? process.env['BSS_OOB_CONFIG'] ?? 'oob/config.json'}`,
  )
  console.log(`  Authentik issuer: ${config.authentik.issuerUrl}`)
  console.log(
    `  Csoportok: admin=${config.authentik.groups.admin}, stúdiós=${config.authentik.groups.studio}, jelölt=${config.authentik.groups.studioCandidate}, jelölt-jelölt=${config.authentik.groups.studioCandidateCandidate}, vezetőség=${config.authentik.groups.leadership}, öregtag=${config.authentik.groups.alumni}`,
  )
  console.log(`  Seed fájl helye: ${config.seed.path}`)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
