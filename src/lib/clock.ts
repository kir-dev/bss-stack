export interface Clock {
  now: () => Date
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

export class FakeClock implements Clock {
  private current: Date

  constructor(initial?: Date | string | number) {
    this.current = new Date(initial ?? Date.now())
  }

  now(): Date {
    return new Date(this.current)
  }

  set(instant: Date | string | number): void {
    this.current = new Date(instant)
  }

  advanceMilliseconds(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds)
  }

  advanceMinutes(minutes: number): void {
    this.advanceMilliseconds(minutes * 60_000)
  }

  advanceHours(hours: number): void {
    this.advanceMilliseconds(hours * 3_600_000)
  }

  advanceDays(days: number): void {
    this.advanceMilliseconds(days * 86_400_000)
  }
}

export const systemClock: Clock = new SystemClock()
