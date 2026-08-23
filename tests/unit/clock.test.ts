import { describe, expect, it } from 'vitest'
import { FakeClock, SystemClock } from '#/lib/clock.ts'

describe('FakeClock', () => {
  it('fixált időpontot ad vissza', () => {
    const clock = new FakeClock('2026-06-06T12:00:00.000Z')
    expect(clock.now().toISOString()).toBe('2026-06-06T12:00:00.000Z')
  })

  it('tetszőleges időpontra állítható', () => {
    const clock = new FakeClock()
    clock.set('2030-01-01T00:00:00.000Z')
    expect(clock.now().toISOString()).toBe('2030-01-01T00:00:00.000Z')
  })

  it('percenkénti előretolás működik', () => {
    const clock = new FakeClock('2026-06-06T10:00:00.000Z')
    clock.advanceMinutes(90)
    expect(clock.now().toISOString()).toBe('2026-06-06T11:30:00.000Z')
  })

  it('30 nap előretolása a lomtár-törlés szimulációjához', () => {
    const trashedAt = new Date('2026-06-01T08:00:00.000Z')
    const clock = new FakeClock(trashedAt)
    clock.advanceDays(30)
    expect(clock.now().getTime() - trashedAt.getTime()).toBe(30 * 86_400_000)
    expect(clock.now().toISOString()).toBe('2026-07-01T08:00:00.000Z')
  })

  it('órapéldányok egymástól függetlenek', () => {
    const first = new FakeClock('2026-01-01T00:00:00.000Z')
    const second = new FakeClock('2026-01-01T00:00:00.000Z')
    first.advanceDays(5)
    expect(second.now().toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('SystemClock', () => {
  it('a valós időhöz közeli értéket ad', () => {
    const before = Date.now()
    const value = new SystemClock().now().getTime()
    const after = Date.now()
    expect(value).toBeGreaterThanOrEqual(before)
    expect(value).toBeLessThanOrEqual(after)
  })
})
