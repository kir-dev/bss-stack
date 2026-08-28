import { describe, expect, it } from 'vitest'
import {
  AcademicSemesterFormatError,
  formatAcademicSemester,
  parseAcademicSemester,
} from '#/server/members/member-fields.ts'
import { formatAcademicSemesterHu } from '#/lib/academic-semester.ts'

describe('tanulmányi félév formátum', () => {
  it('az őszi félév az első évhez, a tavaszi a másodikhoz tartozik', () => {
    expect(parseAcademicSemester('2021/2022/1')).toEqual({
      year: 2021,
      semester: 'autumn',
    })
    expect(parseAcademicSemester('2021/2022/2')).toEqual({
      year: 2022,
      semester: 'spring',
    })
  })

  it('a körbeforgatás visszaadja az eredeti feliratot', () => {
    for (const value of ['2018/2019/1', '2018/2019/2', '2025/2026/1']) {
      const parsed = parseAcademicSemester(value)
      expect(formatAcademicSemester(parsed.year, parsed.semester)).toBe(value)
    }
  })

  it('hiányzó félévre null feliratot ad', () => {
    expect(formatAcademicSemester(null, null)).toBeNull()
    expect(formatAcademicSemester(2021, null)).toBeNull()
    expect(formatAcademicSemester(null, 'autumn')).toBeNull()
  })

  it('a második évszámnak az elsőt követő évnek kell lennie', () => {
    expect(() => parseAcademicSemester('2021/2023/1')).toThrow(
      AcademicSemesterFormatError,
    )
    expect(() => parseAcademicSemester('2021/2023/1')).toThrow(
      /második évszámnak/,
    )
    expect(() => parseAcademicSemester('2021/2020/2')).toThrow(
      AcademicSemesterFormatError,
    )
  })

  it('a régi "2021 ősz" alak és az egyéb szemét elutasított', () => {
    for (const value of [
      '2021 ősz',
      '2021 tavasz',
      'autumn',
      '2021/2022/3',
      '2021/2022/0',
      '2021/2022',
      '21/22/1',
      '2021/2022/1/1',
      '',
    ]) {
      expect(() => parseAcademicSemester(value)).toThrow(
        AcademicSemesterFormatError,
      )
    }
  })

  it('a körülvevő szóközöket lenyeli', () => {
    expect(parseAcademicSemester('  2021/2022/1  ')).toEqual({
      year: 2021,
      semester: 'autumn',
    })
  })

  it('az irreális évszám elutasított', () => {
    expect(() => parseAcademicSemester('1800/1801/1')).toThrow(/1950/)
  })
})

describe('félév megjelenítése', () => {
  it('a kanonikus alakot magyar feliratra fordítja', () => {
    expect(formatAcademicSemesterHu('2020/2021/1')).toBe('2020 ősz')
    expect(formatAcademicSemesterHu('2020/2021/2')).toBe('2021 tavasz')
  })

  it('az értelmezhetetlen értéket változatlanul adja vissza', () => {
    expect(formatAcademicSemesterHu('2021 ősz')).toBe('2021 ősz')
    expect(formatAcademicSemesterHu('')).toBe('')
  })
})
