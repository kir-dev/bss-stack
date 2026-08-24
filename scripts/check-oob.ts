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
    `  Csoportok: schonherz=${config.authentik.groups.schonherz}, tag=${config.authentik.groups.tag}, vezetoseg=${config.authentik.groups.vezetoseg}`,
  )
  console.log(`  Méria hostok: ${config.media.allowedHosts.join(', ')}`)
  console.log(`  Seed fájl helye: ${config.seed.path}`)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
