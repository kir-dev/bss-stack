import { describe, expect, it } from 'vitest'
import { parsePaginationNumber } from '#/server/shared/pagination.ts'
import { getPaginationItems } from '#/lib/pagination.ts'

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

describe('megjelenített oldalszámok', () => {
  it('rövid listán minden oldalt megjelenít', () => {
    expect(getPaginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('hosszú lista elején a távoli oldalakat kihagyja', () => {
    expect(getPaginationItems(2, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20])
  })

  it('hosszú lista közepén a jelenlegi oldal környezetét mutatja', () => {
    expect(getPaginationItems(10, 20)).toEqual([
      1,
      'ellipsis',
      9,
      10,
      11,
      'ellipsis',
      20,
    ])
  })

  it('hosszú lista végén az utolsó oldalakat mutatja', () => {
    expect(getPaginationItems(19, 20)).toEqual([
      1,
      'ellipsis',
      16,
      17,
      18,
      19,
      20,
    ])
  })
})
