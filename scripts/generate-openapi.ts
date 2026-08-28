import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  buildMemberWebhookOpenApi,
  MEMBER_WEBHOOK_OPENAPI_PATH,
  renderMemberWebhookOpenApi,
} from '#/server/api/openapi.ts'

function main(): void {
  const yaml = renderMemberWebhookOpenApi()
  mkdirSync(dirname(MEMBER_WEBHOOK_OPENAPI_PATH), { recursive: true })
  writeFileSync(MEMBER_WEBHOOK_OPENAPI_PATH, yaml, 'utf-8')

  const document = buildMemberWebhookOpenApi() as {
    info: { version: string }
  }
  console.log(
    `OpenAPI kiírva: ${MEMBER_WEBHOOK_OPENAPI_PATH} (v${document.info.version}, ${yaml.split('\n').length} sor)`,
  )
}

main()
