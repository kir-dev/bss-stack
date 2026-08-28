import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  createWebhookClient,
  listWebhookClients,
  revokeWebhookClient,
  rotateWebhookClientSecret,
  WebhookClientNameConflictError,
  WebhookClientNotFoundError,
} from '#/server/webhooks/clients.ts'
import { TextValidationError } from '#/server/shared/text.ts'

const USAGE = `Használat:
  pnpm webhook:client list
  pnpm webhook:client create <név>
  pnpm webhook:client rotate <kliens-id>
  pnpm webhook:client revoke <kliens-id>

A tagfrissítő webhook klienseit kezeli közvetlenül az adatbázisban. Ugyanez
elérhető az /admin/members oldalon is; ez a CLI az első kliens létrehozásához
kell, amikor még senki nem tud bejelentkezni.`

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(
      'A DATABASE_URL környezeti változó nincs beállítva. ' +
        'Állítsd be a .env fájlban (lásd .env.example), majd futtasd újra.',
    )
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const command = args.at(0)
  const argument = args.at(1)
  if (command === undefined || command === '--help' || command === '-h') {
    console.log(USAGE)
    process.exit(command === undefined ? 1 : 0)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const db = drizzle({ client: pool })

    if (command === 'list') {
      const clients = await listWebhookClients(db)
      if (clients.length === 0) {
        console.log('Nincs egyetlen webhook kliens sem.')
        return
      }
      for (const client of clients) {
        const state = client.revokedAt === null ? 'aktív' : 'visszavont'
        const used =
          client.lastUsedAt === null
            ? 'még nem használt'
            : `utoljára: ${client.lastUsedAt.toISOString()}`
        console.log(`${client.id}  ${state.padEnd(11)} ${used}  ${client.name}`)
      }
      return
    }

    if (command === 'create') {
      const created = await createWebhookClient(db, {
        name: argument,
        createdBy: null,
      })
      console.log(`Létrehozva: ${created.client.name} (${created.client.id})`)
      console.log('')
      console.log('Bearer token (csak most jelenik meg, őrizd meg):')
      console.log(`  ${created.token}`)
      return
    }

    if (command === 'rotate') {
      if (argument === undefined) {
        console.error('Hiányzó kliens-id.\n\n' + USAGE)
        process.exit(1)
      }
      const rotated = await rotateWebhookClientSecret(db, argument)
      console.log(`Új titok: ${rotated.client.name} (${rotated.client.id})`)
      console.log('')
      console.log('Bearer token (a régi azonnal érvénytelen):')
      console.log(`  ${rotated.token}`)
      return
    }

    if (command === 'revoke') {
      if (argument === undefined) {
        console.error('Hiányzó kliens-id.\n\n' + USAGE)
        process.exit(1)
      }
      const revoked = await revokeWebhookClient(db, argument, new Date())
      console.log(`Visszavonva: ${revoked.name} (${revoked.id})`)
      return
    }

    console.error(`Ismeretlen parancs: ${command}\n\n${USAGE}`)
    process.exit(1)
  } catch (error) {
    if (
      error instanceof TextValidationError ||
      error instanceof WebhookClientNameConflictError ||
      error instanceof WebhookClientNotFoundError
    ) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  } finally {
    await pool.end()
  }
}

void main()
