import { describe, expect, it } from 'vitest'
import { parsePaginationNumber } from '#/server/shared/pagination.ts'

describe('lapozási paraméterek értelmezése', () => {
  it('az URL-ből érkező szöveges oldalszámot elfogadja', () => {
    expect(parsePaginationNumber('2', 1)).toBe(2)
    expect(parsePaginationNumber('17', 1)).toBe(17)
  })

  it('a számot változtatás nélkül átengedi', () => {
    expect(parsePaginationNumber(3, 1)).toBe(3)
  })

  it('érvénytelen vagy hiányzó érték az alapértelmezésre esik vissza', () => {
    for (const value of [undefined, '', '0', '-2', 'abc', '1.5', 0, -1, 2.5]) {
      expect(parsePaginationNumber(value, 25)).toBe(25)
    }
  })
})
