import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadOobConfig, OobConfigFileError } from '#/server/config/load.ts'
import { validateOobConfig } from '#/server/config/oob-schema.ts'
import { buildRawOobConfig } from '../helpers/oob-config.ts'

describe('OOB config betöltés', () => {
  it('hiányzó fájlnál konkrét hibával megáll', () => {
    expect(() => loadOobConfig('/nem/letezo/config.json')).toThrow(
      OobConfigFileError,
    )
    try {
      loadOobConfig('/nem/letezo/config.json')
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).toContain('/nem/letezo/config.json')
      expect((error as Error).message).toContain('BSS_OOB_CONFIG')
    }
  })

  it('érvénytelen JSON-nál konkrét hibával megáll', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bss-oob-'))
    const path = join(dir, 'config.json')
    writeFileSync(path, '{ ez nem json')

    try {
      expect(() => loadOobConfig(path)).toThrow(/nem érvényes JSON/)
      expect(() => loadOobConfig(path)).toThrow(path)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('érvényes fájlt betölt és validál', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bss-oob-'))
    const path = join(dir, 'config.json')
    writeFileSync(path, JSON.stringify(buildRawOobConfig()))

    try {
      const config = loadOobConfig(path)
      expect(config.seed.path).toBe('oob/seed.json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validációs hibaüzenetben nem jelenik meg a titok', () => {
    const secret = 'nagyon-titkos-ertek-amit-soha-nem-szabad-kiirni'
    const raw = buildRawOobConfig()
    raw.authentik.clientSecret = secret
    raw.authentik.scopes = []

    try {
      validateOobConfig(raw)
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).not.toContain(secret)
      expect((error as Error).message).not.toContain(
        'local-test-secret-not-for-production',
      )
    }
  })
})
