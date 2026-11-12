import { describe, expect, it } from 'vitest'
import { MAX_CLOCK_SKEW_MS, parsePushDate, withinClockSkew } from './date'

describe('parsePushDate', () => {
  it('reads the instant and the phone-local day', () => {
    const parsed = parsePushDate('2026-11-03T09:41:07+01:00')
    expect(parsed).toEqual({ instantMs: Date.UTC(2026, 10, 3, 8, 41, 7), localDate: '2026-11-03', offsetMinutes: 60 })
  })

  it('reads the offset from the string, so winter and summer differ by an hour', () => {
    const winter = parsePushDate('2026-01-15T12:00:00+01:00')
    const summer = parsePushDate('2026-07-15T12:00:00+02:00')
    expect(winter?.instantMs).toBe(Date.UTC(2026, 0, 15, 11))
    expect(summer?.instantMs).toBe(Date.UTC(2026, 6, 15, 10))
  })

  it('keeps just after midnight on the local day even though UTC is the day before', () => {
    const parsed = parsePushDate('2026-07-02T00:30:00+02:00')
    expect(new Date(parsed?.instantMs ?? 0).toISOString()).toBe('2026-07-01T22:30:00.000Z')
    expect(parsed?.localDate).toBe('2026-07-02')
  })

  it('accepts an offset written without a colon', () => {
    expect(parsePushDate('2026-11-03T09:41:07+0100')?.instantMs).toBe(Date.UTC(2026, 10, 3, 8, 41, 7))
  })

  it('refuses a year under 100, which JavaScript would move to the 1900s', () => {
    expect(parsePushDate('0026-11-03T09:41:07+01:00')).toBeNull()
  })

  it('accepts Z, a negative offset and fractional seconds', () => {
    expect(parsePushDate('2026-11-03T09:41:07Z')?.instantMs).toBe(Date.UTC(2026, 10, 3, 9, 41, 7))
    expect(parsePushDate('2026-11-03T09:41:07.250-05:00')?.instantMs).toBe(Date.UTC(2026, 10, 3, 14, 41, 7))
  })

  it.each([
    '',
    '2026-11-03',
    '2026-11-03 09:41:07+01:00',
    '2026-11-03T09:41:07',
    '2026-02-30T10:00:00+01:00',
    '2026-13-01T10:00:00+01:00',
    '2026-11-03T24:00:00+01:00',
    '2026-11-03T10:60:00+01:00',
    '2026-11-03T10:00:60+01:00',
    '2026-11-03T10:00:00+15:00',
    '2026-11-03T10:00:00+01:60',
  ])('refuses %j', (text) => {
    expect(parsePushDate(text)).toBeNull()
  })
})

describe('withinClockSkew', () => {
  const now = Date.UTC(2026, 10, 3, 12)
  it('accepts a push up to two days either side of the server clock', () => {
    expect(withinClockSkew(now - MAX_CLOCK_SKEW_MS, now)).toBe(true)
    expect(withinClockSkew(now + MAX_CLOCK_SKEW_MS, now)).toBe(true)
  })
  it('refuses a push further away', () => {
    expect(withinClockSkew(now - MAX_CLOCK_SKEW_MS - 1, now)).toBe(false)
    expect(withinClockSkew(now + MAX_CLOCK_SKEW_MS + 1, now)).toBe(false)
  })
})
