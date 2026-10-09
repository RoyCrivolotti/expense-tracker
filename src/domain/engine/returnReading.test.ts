import { describe, expect, it } from 'vitest'
import { makeScenario, makeTransaction, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'
import { distinctCheckins } from './wealthTracking'
import { portfolioReturn, readReturn } from './portfolioReturn'

const accounts = [makeWealthAccount({ id: 1, kind: 'investment' }), makeWealthAccount({ id: 2, kind: 'cash' })]

function checkin(id: number, date: string, invested: number, createdAt?: string) {
  return makeWealthCheckin({
    id,
    checkinDate: date,
    ...(createdAt ? { createdAt } : {}),
    entries: [
      { accountId: 1, valueCents: invested },
      { accountId: 2, valueCents: 0 },
    ],
  })
}
const deposit = (date: string, amountCents: number, over = {}) =>
  makeTransaction({ date, budgetMonth: date.slice(0, 7), type: 'investment', amountCents, ...over })

/** A plan that expects 1.000 a month, and one that expects nothing. */
const investing = makeScenario({ monthlyContributionCents: 100_000, planStartDate: '2024-01-01' })
const idle = makeScenario({ monthlyContributionCents: 0, planStartDate: '2024-01-01', contributionSchedule: [] })

describe('distinctCheckins', () => {
  it('puts the check-ins in date order, one for each date, the one logged last', () => {
    const early = checkin(1, '2025-06-01', 100_000_00, '2025-06-01T08:00:00Z')
    const corrected = checkin(2, '2025-06-01', 110_000_00, '2025-06-01T09:30:00Z')
    const later = checkin(3, '2026-01-01', 112_000_00)
    expect(distinctCheckins([later, corrected, early]).map((c) => c.id)).toEqual([2, 3])
    expect(distinctCheckins([early, corrected, later]).map((c) => c.id)).toEqual([2, 3])
  })

  it('goes by the later id when two were logged at the same moment', () => {
    const a = checkin(4, '2025-06-01', 1, '2025-06-01T08:00:00Z')
    const b = checkin(7, '2025-06-01', 2, '2025-06-01T08:00:00Z')
    expect(distinctCheckins([b, a]).map((c) => c.id)).toEqual([7])
  })

  it('is nothing for nothing, and leaves distinct dates alone', () => {
    expect(distinctCheckins([])).toEqual([])
    const some = [checkin(1, '2025-01-01', 1), checkin(2, '2025-02-01', 2)]
    expect(distinctCheckins(some)).toEqual(some)
  })
})

describe('portfolioReturn with two check-ins on one date', () => {
  it('reads the one logged last, and does not take the correction for a return', () => {
    // 100k on 1 June, then the same day corrected to 110k: the 10k is a typo fixed, not a 10% day.
    const twice = [
      checkin(1, '2025-01-01', 100_000_00),
      checkin(2, '2025-06-01', 100_000_00, '2025-06-01T08:00:00Z'),
      checkin(3, '2025-06-01', 110_000_00, '2025-06-01T09:00:00Z'),
      checkin(4, '2026-01-01', 112_000_00),
    ]
    const once = [twice[0]!, twice[2]!, twice[3]!]
    const a = portfolioReturn(twice, accounts, [])!
    const b = portfolioReturn(once, accounts, [])!
    expect(a.periodReturn).toBe(b.periodReturn)
    expect(a.periods).toBe(2)
  })
})

describe('readReturn', () => {
  // 100k to 108k over a year with 1.000 put in mid-year is 7% on what was invested.
  const year = [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2026-01-01', 108_000_00)]

  it('is a figure for a year that returned 7% with the investments recorded', () => {
    const reading = readReturn(year, accounts, [deposit('2025-06-01', 1_000_00)], investing)
    expect(reading?.kind).toBe('figure')
  })

  it('is a figure with nothing recorded when the plan expects nothing to be invested', () => {
    expect(readReturn(year, accounts, [], idle)?.kind).toBe('figure')
    expect(readReturn(year, accounts, [], null)?.kind).toBe('figure')
  })

  it('says no investments are recorded when the plan expects them, so the balance may include money moved in', () => {
    expect(readReturn(year, accounts, [], investing)?.kind).toBe('no-investments')
  })

  it('does not count a transaction outside the period, a cancelled one or a forecast one as recorded', () => {
    const outside = [deposit('2024-12-31', 5_000_00), deposit('2026-01-02', 5_000_00)]
    expect(readReturn(year, accounts, outside, investing)?.kind).toBe('no-investments')
    const unreal = [deposit('2025-06-01', 5_000_00, { status: 'cancelled' }), deposit('2025-07-01', 5_000_00, { status: 'forecast' })]
    expect(readReturn(year, accounts, unreal, investing)?.kind).toBe('no-investments')
  })

  it('counts a transaction on the last day of the period, which a check-in holds', () => {
    expect(readReturn(year, accounts, [deposit('2026-01-01', 1_000_00)], investing)?.kind).toBe('figure')
  })

  it('hides a return above 30% a year, which is money moved in that nothing accounts for', () => {
    // An account opened with 10k put in on day 29 of 30, then 10.2k, then 11k a year on, which a return of about 2% over that month annualises to well over 30% a year.
    const opened = [checkin(1, '2025-01-01', 0), checkin(2, '2025-01-31', 10_200_00), checkin(3, '2026-01-01', 11_000_00)]
    const reading = readReturn(opened, accounts, [deposit('2025-01-30', 10_000_00)], investing)
    expect(reading?.kind).toBe('too-high')
    if (reading?.kind === 'too-high') expect(reading.ret.impliedYearly).toBeGreaterThan(0.5)
  })

  it('applies the 30% line to a short stretch too, by what it would be over a year', () => {
    const month = (end: number) => [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2025-01-31', end)]
    // +1% in 30 days is about 13% a year; +3% is about 43%.
    expect(readReturn(month(101_000_00), accounts, [], idle)?.kind).toBe('figure')
    expect(readReturn(month(103_000_00), accounts, [], idle)?.kind).toBe('too-high')
  })

  it('draws the line at 30% a year', () => {
    const grown = (end: number) => [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2026-01-01', end)]
    expect(readReturn(grown(129_800_00), accounts, [], idle)?.kind).toBe('figure')
    expect(readReturn(grown(130_200_00), accounts, [], idle)?.kind).toBe('too-high')
  })

  it('says the missing investments first when both apply, since that is what to fix', () => {
    const jump = [checkin(1, '2025-01-01', 100_000_00), checkin(2, '2026-01-01', 150_000_00)]
    expect(readReturn(jump, accounts, [], investing)?.kind).toBe('no-investments')
    expect(readReturn(jump, accounts, [], idle)?.kind).toBe('too-high')
  })

  it('is nothing where there is no return to read', () => {
    expect(readReturn([], accounts, [], investing)).toBeNull()
    expect(readReturn([checkin(1, '2025-01-01', 1_000)], accounts, [], investing)).toBeNull()
  })

  it('does not depend on the unit the amounts are in', () => {
    const scaled = (k: number) => ({
      kind: readReturn(
        [checkin(1, '2025-01-01', 100_000_00 * k), checkin(2, '2026-01-01', 108_000_00 * k)],
        accounts,
        [deposit('2025-06-01', 1_000_00 * k)],
        investing,
      )?.kind,
    })
    expect(scaled(100)).toEqual(scaled(1))
    const tooHigh = (k: number) =>
      readReturn([checkin(1, '2025-01-01', 100_000_00 * k), checkin(2, '2026-01-01', 150_000_00 * k)], accounts, [], idle)?.kind
    expect(tooHigh(0.01)).toBe(tooHigh(1000))
  })

  it('carries the return it read, and how it compares with a year, for either kind', () => {
    const reading = readReturn(year, accounts, [deposit('2025-06-01', 1_000_00)], investing)!
    expect(reading.ret.annualised).toBeCloseTo(0.07, 2)
    expect(reading.ret.impliedYearly).toBeCloseTo(0.07, 2)
  })
})
