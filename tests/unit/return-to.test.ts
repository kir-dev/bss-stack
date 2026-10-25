import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo } from '#/lib/return-to.ts'

describe('returnTo szűrés', () => {
  it('a saját oldalra mutató relatív útvonalat megtartja', () => {
    expect(sanitizeReturnTo('/videos')).toBe('/videos')
    expect(sanitizeReturnTo('/videos?page=2#lista')).toBe(
      '/videos?page=2#lista',
    )
    expect(sanitizeReturnTo('/search?q=a b')).toBe('/search?q=a b')
  })

  it('hiányzó vagy üres értékre a főoldalt adja', () => {
    expect(sanitizeReturnTo(null)).toBe('/')
    expect(sanitizeReturnTo('')).toBe('/')
  })

  it('más oldalra vivő értékre a főoldalt adja', () => {
    for (const evil of [
      'https://rossz.example.com',
      '//rossz.example.com',
      '/\\rossz.example.com',
      'javascript:alert(1)',
      'videos',
    ]) {
      expect(sanitizeReturnTo(evil)).toBe('/')
    }
  })

  it('vezérlőkaraktert tartalmazó értékre a főoldalt adja', () => {
    for (const evil of [
      '/\t/rossz.example.com',
      '/\n/rossz.example.com',
      '/\r/rossz.example.com',
      '/videos\u0000',
      '/videos\u007f',
    ]) {
      expect(sanitizeReturnTo(evil)).toBe('/')
    }
  })

  it('a túl hosszú értékre a főoldalt adja', () => {
    expect(sanitizeReturnTo(`/${'a'.repeat(2048)}`)).toBe('/')
  })
})
