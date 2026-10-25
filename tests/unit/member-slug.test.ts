import { describe, expect, it } from 'vitest'
import { isDotSegment, memberProfilePath } from '#/lib/member-slug.ts'

describe('tagprofil útvonala', () => {
  it('a felhasználónevet használja, ha ismert', () => {
    expect(memberProfilePath({ sub: '42', username: 'misika' })).toBe(
      '/members/misika',
    )
  })

  it('belépés előtt a sub-ot használja', () => {
    expect(memberProfilePath({ sub: '42', username: null })).toBe('/members/42')
  })

  it('a speciális karaktereket URL-kódolja', () => {
    expect(memberProfilePath({ sub: 'a/b?c#d', username: null })).toBe(
      '/members/a%2Fb%3Fc%23d',
    )
    expect(memberProfilePath({ sub: '42', username: 'kovacs@sch' })).toBe(
      '/members/kovacs%40sch',
    )
  })

  it('a . és .. nevet útvonalszakasznak ismeri fel', () => {
    expect(isDotSegment('.')).toBe(true)
    expect(isDotSegment('..')).toBe(true)
    expect(isDotSegment('...')).toBe(false)
    expect(isDotSegment('kovacs.janos')).toBe(false)
  })
})
