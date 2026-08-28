import { describe, expect, it } from 'vitest'
import { parseVideoStartTime } from '#/lib/video-time.ts'

describe('parseVideoStartTime', () => {
  it.each([
    ['0', 0],
    ['90', 90],
    ['1.5', 1.5],
    ['90s', 90],
    ['1m30s', 90],
    ['2h5m10s', 7510],
  ])('parses %s', (value, expected) => {
    expect(parseVideoStartTime(value)).toBe(expected)
  })

  it.each(['', '-1', '1:30', 'soon', '1m30'])('rejects %s', (value) => {
    expect(parseVideoStartTime(value)).toBeUndefined()
  })
})
