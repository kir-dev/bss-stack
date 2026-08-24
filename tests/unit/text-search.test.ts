import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeForSearch } from '#/lib/text-search.ts'

describe('lista szűrése kereséssel', () => {
  it('kisbetűsít és ékezetet bont', () => {
    expect(normalizeForSearch('  Schönherz Mátrix ')).toBe('schonherz matrix')
  })

  it('ékezet nélkül írt keresés is talál', () => {
    expect(matchesSearch('Schönherz Mátrix', 'schonherz')).toBe(true)
    expect(matchesSearch('Schönherz Mátrix', 'MÁTRIX')).toBe(true)
  })

  it('minden keresőszónak szerepelnie kell', () => {
    expect(matchesSearch('Simonyi Konferencia 2024', 'simonyi 2024')).toBe(true)
    expect(matchesSearch('Simonyi Konferencia 2024', 'simonyi 2025')).toBe(
      false,
    )
  })

  it('üres keresés mindenre illeszkedik', () => {
    expect(matchesSearch('bármi', '   ')).toBe(true)
  })
})
