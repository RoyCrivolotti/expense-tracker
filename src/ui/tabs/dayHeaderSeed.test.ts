import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultExpenseSettings } from '../../engine'
import { makeDataset, makeTransaction } from '../../testing/factories'
import type { ExpenseModel } from '../useExpenseData'
import { dayHeaderSeed } from './dayHeaderSeed'

/** A budget that rolls over on the 25th, so 1 November files under November by the date rule. */
function model(): ExpenseModel {
  const dataset = makeDataset({
    settings: { ...defaultExpenseSettings(), budgetRolloverDay: 25 },
    transactions: [makeTransaction({ id: 1, date: '2026-11-01', budgetMonth: '2026-12' })],
  })
  return { dataset } as unknown as ExpenseModel
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-12-10T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('dayHeaderSeed', () => {
  it('files the row under the month on screen when the list shows that budget month', () => {
    expect(dayHeaderSeed(model(), '2026-12', 'budgetMonth', '2026-11-01')).toEqual({
      date: '2026-11-01',
      budgetMonth: '2026-12',
    })
  })

  it('keeps the month on screen even when it is settled and the big + would move on to the next', () => {
    // December's one card has its statement paid and January already has a row, so the date rule offers January
    // for a December date; the day header is inside December on purpose.
    const dataset = makeDataset({
      settings: { ...defaultExpenseSettings(), budgetRolloverDay: 1 },
      accounts: [{ id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true }],
      transactions: [
        makeTransaction({ id: 1, date: '2026-12-05', budgetMonth: '2026-12', accountId: 2 }),
        makeTransaction({ id: 2, date: '2027-01-02', budgetMonth: '2027-01', accountId: 2 }),
      ],
      accountStatements: [{ accountId: 2, yearMonth: '2026-12', paid: true }],
    })
    const settled = { dataset } as unknown as ExpenseModel
    expect(dayHeaderSeed(settled, '2026-12', 'allDates', '2026-12-10').budgetMonth).toBe('2027-01')
    expect(dayHeaderSeed(settled, '2026-12', 'budgetMonth', '2026-12-10').budgetMonth).toBe('2026-12')
  })

  it('lets the date rule decide under the scopes that mix budget months', () => {
    for (const scope of ['last3Months', 'allDates', 'custom'] as const) {
      expect(dayHeaderSeed(model(), '2026-12', scope, '2026-11-01')).toEqual({
        date: '2026-11-01',
        budgetMonth: '2026-11',
      })
    }
  })
})
