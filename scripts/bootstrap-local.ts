import { writeLocalFiles } from './lib/local-bootstrap.ts'

const result = writeLocalFiles(process.cwd())

console.log(
  'Lokális infrastruktúra fájlok elkészültek (oob/ könyvtár, gitignore-olt).',
)
if (result.created) {
  console.log('Új helyi titkok generálva.')
} else {
  console.log('Meglévő helyi titkok megőrizve (idempotens futás).')
}

console.log('')
console.log('Tesztfelhasználók (jelszavak: oob/local-secrets.json):')
for (const [username, password] of Object.entries(result.secrets.passwords)) {
  console.log(`  ${username} / ${password}`)
}
console.log('')
console.log('Következő lépések:')
console.log('  1. docker compose -f docker-compose.dev.yml up -d')
console.log(
  '  2. DATABASE_URL=postgres://bss:bss@127.0.0.1:5582/bss pnpm db:migrate',
)
console.log('  3. pnpm check:oob')
console.log(
  '  Ha az Authentik már fut, a blueprint automatikusan érvényesül; ellenőrzés:',
)
console.log(
  '  curl http://127.0.0.1:9000/application/o/bss-stack/.well-known/openid-configuration',
)
