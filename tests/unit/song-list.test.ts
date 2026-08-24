import { describe, expect, it } from 'vitest'
import {
  hasSongDash,
  parseSongList,
  serializeSongList,
  stripSongDashes,
} from '#/lib/song-list.ts'

describe('felhasznált zenék értelmezése', () => {
  it('soronként előadó/cím párra bontja a szóközös kötőjelet', () => {
    expect(parseSongList('Kispál - Naphoz Holddal\nBikini - Ezt nem tudom')) //
      .toEqual([
        { artist: 'Kispál', title: 'Naphoz Holddal' },
        { artist: 'Bikini', title: 'Ezt nem tudom' },
      ])
  })

  it('a szóköz nélküli egyetlen kötőjelet is elfogadja', () => {
    expect(parseSongList('Artist-Title')).toEqual([
      { artist: 'Artist', title: 'Title' },
    ])
  })

  it('gondolatjellel írt sort is felismer', () => {
    expect(parseSongList('Előadó – Szám')).toEqual([
      { artist: 'Előadó', title: 'Szám' },
    ])
  })

  it('az üres sorokat kihagyja, az üres szöveg üres lista', () => {
    expect(parseSongList('\n\nA - B\n\n')).toEqual([
      { artist: 'A', title: 'B' },
    ])
    expect(parseSongList('')).toEqual([])
  })

  it('nem értelmezhető tartalomra null-t ad', () => {
    // Nincs elválasztó, több elválasztó, illetve hiányzó oldal.
    expect(parseSongList('Csak egy cím')).toBeNull()
    expect(parseSongList('A - B - C')).toBeNull()
    expect(parseSongList('- B')).toBeNull()
    expect(parseSongList('A - B\nnincs kötőjel')).toBeNull()
  })

  it('a szerializálás visszaadja a tárolt formát', () => {
    expect(
      serializeSongList([
        { artist: ' Kispál ', title: ' Naphoz Holddal ' },
        { artist: '', title: '' },
        { artist: 'Bikini', title: 'Ezt nem tudom' },
      ]),
    ).toBe('Kispál - Naphoz Holddal\nBikini - Ezt nem tudom')
  })

  it('félig kitöltött sorból nem lóg ki elválasztó', () => {
    expect(serializeSongList([{ artist: 'Kispál', title: '' }])).toBe('Kispál')
    expect(serializeSongList([{ artist: '', title: 'Szám' }])).toBe('Szám')
  })

  it('a szerializált szöveg újra értelmezhető', () => {
    const entries = [
      { artist: 'A', title: 'B' },
      { artist: 'C', title: 'D' },
    ]
    expect(parseSongList(serializeSongList(entries))).toEqual(entries)
  })

  it('a kötőjel-változatokat kiszűri a mezőértékből', () => {
    expect(stripSongDashes('A-B–C—D')).toBe('ABCD')
    expect(hasSongDash('A-B')).toBe(true)
    expect(hasSongDash('AB')).toBe(false)
  })
})
