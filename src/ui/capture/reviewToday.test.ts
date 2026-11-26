import { describe, expect, it } from 'vitest'
import { localToday } from './reviewToday'

/**
 * A clock whose own calendar and UTC's disagree, as they do near midnight anywhere but on UTC itself. Built by hand
 * so the test says the same thing whatever time zone it runs in.
 */
const clock = (
  local: [number, number, number],
  utc: [number, number, number],
) =>
  ({
    getFullYear: () => local[0],
    getMonth: () => local[1] - 1,
    getDate: () => local[2],
    getUTCFullYear: () => utc[0],
    getUTCMonth: () => utc[1] - 1,
    getUTCDate: () => utc[2],
    toISOString: () => `${utc[0]}-${String(utc[1]).padStart(2, '0')}-${String(utc[2]).padStart(2, '0')}T23:30:00.000Z`,
  }) as unknown as Date

describe('today, for "Today" and "Yesterday" on a row', () => {
  it('is the day on this device just after its midnight, while UTC is still on the day before', () => {
    expect(localToday(clock([2026, 11, 10], [2026, 11, 9]))).toBe('2026-11-10')
  })

  it('is the day on this device just before its midnight, when UTC is already on the next day', () => {
    expect(localToday(clock([2026, 12, 31], [2027, 1, 1]))).toBe('2026-12-31')
  })

  it('pads the month and the day', () => {
    expect(localToday(clock([2026, 3, 5], [2026, 3, 5]))).toBe('2026-03-05')
  })

  it('reads the device\u2019s own clock when given none', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
