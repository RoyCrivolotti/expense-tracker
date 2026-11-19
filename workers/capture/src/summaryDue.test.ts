import { describe, expect, it } from 'vitest'
import { localTime, summaryState } from './summaryDue'

const at = (iso: string) => new Date(iso)
const madrid = (mode: 'daily' | 'weekly', lastSummaryAt: string | null = null) => ({ mode, timeZone: 'Europe/Madrid', lastSummaryAt })

describe('localTime', () => {
  it('reads the date, hour and weekday on the person\'s own clock', () => {
    expect(localTime(at('2026-11-23T19:00:00Z'), 'Europe/Madrid')).toEqual({ date: '2026-11-23', hour: 20, weekday: 1 })
    // Midnight is hour 0, not 24, and the calendar date has already turned.
    expect(localTime(at('2026-11-23T23:00:00Z'), 'Europe/Madrid')).toEqual({ date: '2026-11-24', hour: 0, weekday: 2 })
  })

  it('is null for a zone the platform does not know, a blank zone and an instant that is no date', () => {
    expect(localTime(at('2026-11-23T19:00:00Z'), 'Mars/Olympus')).toBeNull()
    expect(localTime(at('2026-11-23T19:00:00Z'), '')).toBeNull()
    expect(localTime(at('nonsense'), 'Europe/Madrid')).toBeNull()
  })
})

describe('summaryState, daily', () => {
  it('is due from 20:00 local and not before', () => {
    expect(summaryState(madrid('daily'), at('2026-11-23T18:59:00Z'))).toBe('not-yet')
    expect(summaryState(madrid('daily'), at('2026-11-23T19:00:00Z'))).toBe('due')
  })

  it('is 20:00 on the wall clock on both sides of a summer time change', () => {
    // Clocks went forward in Madrid on 2027-03-28: 20:00 is 19:00 UTC before it and 18:00 UTC after.
    expect(summaryState(madrid('daily'), at('2027-03-27T18:00:00Z'))).toBe('not-yet')
    expect(summaryState(madrid('daily'), at('2027-03-27T19:00:00Z'))).toBe('due')
    expect(summaryState(madrid('daily'), at('2027-03-28T17:00:00Z'))).toBe('not-yet')
    expect(summaryState(madrid('daily'), at('2027-03-28T18:00:00Z'))).toBe('due')
    // And back, on 2027-10-31: 20:00 is 18:00 UTC before the change and 19:00 UTC after.
    expect(summaryState(madrid('daily'), at('2027-10-30T18:00:00Z'))).toBe('due')
    expect(summaryState(madrid('daily'), at('2027-10-31T18:00:00Z'))).toBe('not-yet')
    expect(summaryState(madrid('daily'), at('2027-10-31T19:00:00Z'))).toBe('due')
  })

  it('does not send twice in an evening, but sends the next one', () => {
    const sent = '2026-11-23T19:00:05Z'
    expect(summaryState(madrid('daily', sent), at('2026-11-23T19:00:00Z'))).toBe('sent')
    expect(summaryState(madrid('daily', sent), at('2026-11-23T21:00:00Z'))).toBe('sent')
    expect(summaryState(madrid('daily', sent), at('2026-11-24T19:00:00Z'))).toBe('due')
  })

  it('still sends when the cron runs hours late, but not after the evening is over', () => {
    expect(summaryState(madrid('daily'), at('2026-11-23T22:30:00Z'))).toBe('due')
    // 00:30 the next day is a new day, before 20:00 again: the missed evening is not made up.
    expect(summaryState(madrid('daily'), at('2026-11-23T23:30:00Z'))).toBe('not-yet')
  })

  it('reaches a half-hour zone at 20:30, the first hourly run past 20:00', () => {
    const kolkata = { mode: 'daily' as const, timeZone: 'Asia/Kolkata', lastSummaryAt: null }
    expect(summaryState(kolkata, at('2026-11-23T14:00:00Z'))).toBe('not-yet') // 19:30
    expect(summaryState(kolkata, at('2026-11-23T15:00:00Z'))).toBe('due') // 20:30
  })

  it('judges the day by the zone the person is in, not UTC', () => {
    // 20:30 on the 23rd in Auckland (UTC+13 in summer) is already the 23rd 07:30 UTC.
    const auckland = { mode: 'daily' as const, timeZone: 'Pacific/Auckland', lastSummaryAt: '2026-11-23T07:30:00Z' }
    expect(summaryState(auckland, at('2026-11-23T08:30:00Z'))).toBe('sent')
    expect(summaryState(auckland, at('2026-11-24T07:30:00Z'))).toBe('due')
  })

  it('treats an unreadable last time as never sent', () => {
    expect(summaryState(madrid('daily', 'garbage'), at('2026-11-23T19:00:00Z'))).toBe('due')
  })
})

describe('summaryState, weekly', () => {
  it('is due on Monday evening only', () => {
    expect(summaryState(madrid('weekly'), at('2026-11-23T19:00:00Z'))).toBe('due') // Monday
    expect(summaryState(madrid('weekly'), at('2026-11-22T19:00:00Z'))).toBe('not-yet') // Sunday
    expect(summaryState(madrid('weekly'), at('2026-11-24T19:00:00Z'))).toBe('not-yet') // Tuesday
  })

  it('uses Monday in the person\'s zone: late Sunday UTC is already Monday in Auckland', () => {
    const auckland = { mode: 'weekly' as const, timeZone: 'Pacific/Auckland', lastSummaryAt: null }
    expect(summaryState(auckland, at('2026-11-23T07:00:00Z'))).toBe('due') // Mon 20:00 NZDT
    expect(summaryState(auckland, at('2026-11-22T07:00:00Z'))).toBe('not-yet') // Sun 20:00
  })

  it('sends once on the Monday, then waits for the next', () => {
    const sent = '2026-11-23T19:00:05Z'
    expect(summaryState(madrid('weekly', sent), at('2026-11-23T21:00:00Z'))).toBe('sent')
    expect(summaryState(madrid('weekly', sent), at('2026-11-30T19:00:00Z'))).toBe('due')
  })

  it('is due the Monday after a week of daily summaries was chosen away from', () => {
    expect(summaryState(madrid('weekly', '2026-11-22T19:00:00Z'), at('2026-11-23T19:00:00Z'))).toBe('due')
  })
})

describe('summaryState, other cases', () => {
  it('reports a bad zone, whatever else is true', () => {
    expect(summaryState({ mode: 'daily', timeZone: 'Nowhere/Land', lastSummaryAt: null }, at('2026-11-23T19:00:00Z'))).toBe('invalid-zone')
    expect(summaryState({ mode: 'daily', timeZone: '', lastSummaryAt: null }, at('2026-11-23T19:00:00Z'))).toBe('invalid-zone')
  })

  it('is never due for a person who chose a push per payment', () => {
    expect(summaryState({ mode: 'each', timeZone: 'Europe/Madrid', lastSummaryAt: null }, at('2026-11-23T19:00:00Z'))).toBe('not-yet')
  })
})
