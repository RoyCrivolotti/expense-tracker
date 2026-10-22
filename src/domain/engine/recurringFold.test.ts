import { describe, expect, it } from 'vitest'
import { adversarialLedger } from '../../testing/adversarialLedger'
import type { Transaction } from '../types'
import { foldNewerRows } from './recurringFold'
import { groupKeyString, groupTransactions } from './recurringDetect'
import { PREDICT_HISTORY } from './recurringPredict'
import { makeTxn, monthlyDates } from './recurringTestHelpers'

const gym = (id: number, date: string, overrides: Partial<Transaction> = {}) =>
  makeTxn({ id, date, description: 'Gym', budgetMonth: date.slice(0, 7), ...overrides })

describe('foldNewerRows', () => {
  const rows = monthlyDates(2026, 1, 5, 5).map((date, i) => gym(i + 1, date, { amountCents: 3_000 + i }))
  const [group] = groupTransactions(rows)

  it('adds a row newer than the series as its newest charge, and has it speak for the series', () => {
    const logged = gym(9, '2026-06-05', { amountCents: 3_500, description: 'GYM' })
    const [folded] = foldNewerRows([group!], [...rows, logged])
    expect(folded!.dates.at(-1)).toBe('2026-06-05')
    expect(folded).toMatchObject({ label: 'GYM', amountCents: 3_500 })
    expect(folded!.budgetOffsets).toHaveLength(group!.budgetOffsets.length + 1)
    expect([...folded!.budgetMonths]).toContain('2026-06')
  })

  it('leaves a series alone for a row that is older, cancelled, blank, a plan payment or of another series', () => {
    const others = [
      gym(10, '2026-02-20'),
      gym(11, '2026-07-05', { cancelled: true }),
      gym(12, '2026-07-05', { description: '  ' }),
      gym(13, '2026-07-05', { planId: 4 }),
      gym(14, '2026-07-05', { accountId: 9 }),
    ]
    const groups = [group!]
    expect(foldNewerRows(groups, [...rows, ...others])).toBe(groups)
  })

  it('puts several newer rows in date order, ties by id', () => {
    const [folded] = foldNewerRows([group!], [gym(21, '2026-07-05'), gym(20, '2026-07-05'), gym(22, '2026-06-05')])
    expect(folded!.dates.slice(-3)).toEqual(['2026-06-05', '2026-07-05', '2026-07-05'])
  })

  it('makes the groups that all the rows make, for every series of a ledger that was written to after the groups were read', () => {
    const all = adversarialLedger().transactions
    const dates = [...new Set(all.map((t) => t.date))].sort()
    let checked = 0
    for (const cut of [dates[Math.floor(dates.length * 0.5)]!, dates[Math.floor(dates.length * 0.8)]!, dates.at(-3)!]) {
      const older = groupTransactions(all.filter((t) => t.date <= cut))
      const whole = new Map(groupTransactions(all).map((g) => [groupKeyString(g.key), g]))
      for (const folded of foldNewerRows(older, all)) {
        const expected = whole.get(groupKeyString(folded.key))!
        expect(folded.dates, groupKeyString(folded.key)).toEqual(expected.dates)
        expect(folded.budgetOffsets.slice(-PREDICT_HISTORY)).toEqual(expected.budgetOffsets.slice(-PREDICT_HISTORY))
        expect([...folded.budgetMonths].sort()).toEqual([...expected.budgetMonths].sort())
        expect(folded).toMatchObject({ label: expected.label, amountCents: expected.amountCents, categoryId: expected.categoryId })
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(20)
  })
})
