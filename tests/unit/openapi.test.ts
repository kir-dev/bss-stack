import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildMemberWebhookOpenApi,
  MEMBER_WEBHOOK_OPENAPI_PATH,
  renderMemberWebhookOpenApi,
} from '#/server/api/openapi.ts'
import { MEMBER_FIELD_SPECS } from '#/server/members/member-fields.ts'
import { MEMBER_WEBHOOK_PATH } from '#/server/api/webhook-routes.ts'

type Doc = {
  paths: Record<string, Record<string, unknown>>
  components: {
    schemas: Record<string, { properties?: Record<string, unknown> }>
  }
}

function document(): Doc {
  return buildMemberWebhookOpenApi() as unknown as Doc
}

describe('generált OpenAPI dokumentum', () => {
  it('a becsekkolt YAML megegyezik a generálttal', () => {
    const committed = readFileSync(MEMBER_WEBHOOK_OPENAPI_PATH, 'utf-8')
    expect(committed).toBe(renderMemberWebhookOpenApi())
  })

  it('a valódi végpont útvonalát írja le', () => {
    const doc = document()
    expect(Object.keys(doc.paths)).toEqual([MEMBER_WEBHOOK_PATH])
  })

  it('a Member séma pontosan a validált mezőket tartalmazza', () => {
    const member = document().components.schemas['Member']
    expect(Object.keys(member.properties ?? {})).toEqual(
      MEMBER_FIELD_SPECS.map((spec) => spec.name),
    )
  })

  it('a kötelező mezők listája a specifikációból jön', () => {
    const member = document().components.schemas['Member'] as unknown as {
      required: string[]
    }
    expect(member.required).toEqual(
      MEMBER_FIELD_SPECS.filter((spec) => spec.required).map(
        (spec) => spec.name,
      ),
    )
  })

  it('a bemutatkozás nem szerepel a szerződésben', () => {
    const member = document().components.schemas['Member']
    expect(Object.keys(member.properties ?? {})).not.toContain('introduction')
    expect(renderMemberWebhookOpenApi()).not.toContain('"introduction"')
  })

  it('a félév mintája a tényleges validációs mintával azonos', () => {
    const member = document().components.schemas['Member']
    const joined = member.properties?.['joinedSemester'] as { pattern: string }
    const spec = MEMBER_FIELD_SPECS.find(
      (entry) => entry.name === 'joinedSemester',
    )!
    expect(joined.pattern).toBe(spec.pattern)
    expect(new RegExp(joined.pattern).test('2021/2022/1')).toBe(true)
    expect(new RegExp(joined.pattern).test('2021 ősz')).toBe(false)
  })

  it('a YAML érvényes és minden hivatkozása feloldható', () => {
    const yaml = renderMemberWebhookOpenApi()
    expect(yaml.startsWith('# Generated file')).toBe(true)
    // Response codes must stay strings, not YAML integers.
    expect(yaml).toContain('"200":')
    expect(yaml).not.toMatch(/^\s+200:/m)

    const schemas = new Set(
      Object.keys(document().components.schemas).map(
        (name) => `#/components/schemas/${name}`,
      ),
    )
    const referenced = [...yaml.matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (match) => match[0],
    )
    expect(referenced.length).toBeGreaterThan(0)
    for (const ref of referenced) {
      expect(schemas).toContain(ref)
    }
  })
})
