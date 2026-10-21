// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CAPS } from './budget'
import {
  BudgetExceeded,
  DEFAULT_LIMITS,
  SpendLedger,
  assertAccountHasRoom,
  earlierThan,
  emptyTotals,
  totalsFor,
  utcDay,
} from './spend'

const DAY = '2026-10-19'

describe('the spend ledger', () => {
  it('adds up what D1 reports and counts statements', () => {
    const ledger = new SpendLedger(emptyTotals(DAY))
    ledger.record({ rows_read: 10, rows_written: 3 })
    ledger.record({ rows_read: 5 })
    ledger.record(undefined)
    expect(ledger.totals).toEqual({ day: DAY, read: 15, written: 3, statements: 3 })
  })

  it('throws as soon as a statement takes the day over its write cap', () => {
    const ledger = new SpendLedger(emptyTotals(DAY))
    ledger.record({ rows_written: CAPS.rowsWrittenPerDay })
    expect(() => ledger.record({ rows_written: 1 })).toThrow(BudgetExceeded)
  })

  it('throws on the read cap too', () => {
    const ledger = new SpendLedger(emptyTotals(DAY))
    expect(() => ledger.record({ rows_read: CAPS.rowsReadPerDay + 1 })).toThrow(/rows read today/)
  })

  it('refuses a step that would cross the cap before it is sent', () => {
    const ledger = new SpendLedger({ ...emptyTotals(DAY), written: 14_000 })
    expect(() => ledger.assertWithin(900)).not.toThrow()
    expect(() => ledger.assertWithin(1_100)).toThrow(/rows written today would be 15100/)
    expect(() => ledger.assertWithin(0, CAPS.rowsReadPerDay + 1)).toThrow(/rows read today/)
  })

  it('counts earlier days against the total cap but not the daily one', () => {
    const earlier = { read: CAPS.rowsReadTotal - 10, written: CAPS.rowsWrittenTotal - 100 }
    const ledger = new SpendLedger(emptyTotals(DAY), earlier)
    expect(() => ledger.assertWithin(100)).not.toThrow()
    expect(() => ledger.assertWithin(101)).toThrow(/rows written in total/)
    expect(() => ledger.assertWithin(0, 11)).toThrow(/rows read in total/)
  })

  it('takes the limits from the caps by default', () => {
    expect(DEFAULT_LIMITS.writtenPerDay).toBe(CAPS.rowsWrittenPerDay)
    expect(DEFAULT_LIMITS.writtenTotal).toBe(CAPS.rowsWrittenTotal)
  })
})

describe('days', () => {
  const days = [
    { day: '2026-10-18', read: 100, written: 500, statements: 4 },
    { day: DAY, read: 7, written: 9, statements: 1 },
  ]

  it('starts a fresh day when none is stored for it, and finds the stored one otherwise', () => {
    expect(totalsFor(days, '2026-10-20')).toEqual(emptyTotals('2026-10-20'))
    expect(totalsFor(days, DAY)).toEqual(days[1])
    expect(totalsFor(days, DAY)).not.toBe(days[1])
  })

  it('adds up every other day as earlier spend', () => {
    expect(earlierThan(days, DAY)).toEqual({ read: 100, written: 500 })
    expect(earlierThan([], DAY)).toEqual({ read: 0, written: 0 })
  })

  it('names the UTC day, which is when Cloudflare resets the limits', () => {
    expect(utcDay(new Date('2026-10-19T23:59:59-05:00'))).toBe('2026-10-20')
  })
})

describe('the account ceiling', () => {
  it('lets a run start while the account is well below the ceiling', () => {
    expect(() => assertAccountHasRoom({ rowsRead: 1000, rowsWritten: 500 }, 12_000)).not.toThrow()
  })

  it('refuses when the planned writes would pass it, whoever wrote the rows already', () => {
    expect(() => assertAccountHasRoom({ rowsRead: 0, rowsWritten: 30_000 }, 12_000)).toThrow(/account has written 30000/)
  })

  it('refuses when the account has already read too much', () => {
    expect(() => assertAccountHasRoom({ rowsRead: CAPS.accountReadCeiling + 1, rowsWritten: 0 }, 0)).toThrow(/read/)
  })
})
