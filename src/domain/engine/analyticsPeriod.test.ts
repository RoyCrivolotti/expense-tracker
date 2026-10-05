import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import {
  basisOptions,
  monthsForPeriod,
  budgetMonthLength,
  budgetMonthStart,
  sameDaysCut,
  spendThroughCut,
  unpaidExpenseCents,
  withinCut,
} from './analyticsPeriod'

const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03']

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: 1,
    date: '2026-01-05',
    budgetMonth: '2026-01',
    description: 'x',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 1000,
    cancelled: false,
    status: 'posted',
    ...partial,
  }
}

describe('basisOptions', () => {
  it('maps committed to includeForecast and paid to not', () => {
    expect(basisOptions('committed')).toEqual({ includeForecast: true })
    expect(basisOptions('paid')).toEqual({ includeForecast: false })
  })
})

describe('monthsForPeriod', () => {
  it('returns the single month, the calendar year to date, or the last twelve', () => {
    expect(monthsForPeriod(MONTHS, '2026-02', 'month')).toEqual(['2026-02'])
    expect(monthsForPeriod(MONTHS, '2026-02', 'ytd')).toEqual(['2026-01', '2026-02'])
    expect(monthsForPeriod(MONTHS, '2026-02', 'last12')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })
  it('never looks past the selected month', () => {
    expect(monthsForPeriod(MONTHS, '2025-12', 'last12')).toEqual(['2025-11', '2025-12'])
  })
})

describe('budgetMonthStart and budgetMonthLength', () => {
  it('start on the 1st, or on the rollover day of the month before', () => {
    expect(budgetMonthStart('2026-03')).toBe('2026-03-01')
    expect(budgetMonthStart('2026-03', 13)).toBe('2026-02-13')
    expect(budgetMonthStart('2026-01', 13)).toBe('2025-12-13')
  })

  it('count the calendar days between one start and the next', () => {
    expect(budgetMonthLength('2026-02')).toBe(28)
    expect(budgetMonthLength('2026-04', 13)).toBe(31)
    expect(budgetMonthLength('2026-03', 13)).toBe(28)
  })
})

describe('sameDaysCut', () => {
  it('clamps the open month to today and leaves closed months whole', () => {
    expect(sameDaysCut('2026-03', '2026-03-17')?.elapsedDays).toBe(17)
    expect(sameDaysCut('2026-02', '2026-03-17')).toBeNull()
  })

  it('leaves future months whole, since only the one open month is partial', () => {
    expect(sameDaysCut('2026-04', '2026-03-17')).toBeNull()
  })

  it('counts days from the budget month\'s own first day under a rollover', () => {
    // Day-13 rollover: the budget month under way on Oct 5 is October, which began Sep 13.
    expect(sameDaysCut('2026-10', '2026-10-05', '2026-10', 13)?.elapsedDays).toBe(23)
    // Oct 13 starts November's budget month, so that is day 1 of it.
    expect(sameDaysCut('2026-11', '2026-10-13', '2026-11', 13)?.elapsedDays).toBe(1)
    expect(sameDaysCut('2026-10', '2026-10-13', '2026-11', 13)).toBeNull()
  })
})

describe('withinCut', () => {
  it('lets everything through when there is no cut', () => {
    expect(withinCut('2026-01-31', '2026-01', null)).toBe(true)
  })

  it('cuts any month at the same stretch from its own start', () => {
    const cut = sameDaysCut('2026-10', '2026-10-05', '2026-10', 13)!
    // Day 23 of the October budget month is Oct 5; the September one ran Aug 13 on, so Sep 4.
    expect(withinCut('2026-09-20', '2026-10', cut)).toBe(true)
    expect(withinCut('2026-10-05', '2026-10', cut)).toBe(true)
    expect(withinCut('2026-10-06', '2026-10', cut)).toBe(false)
    expect(withinCut('2026-09-04', '2026-09', cut)).toBe(true)
    expect(withinCut('2026-09-05', '2026-09', cut)).toBe(false)
  })

  it('keeps a row dated before its budget month began', () => {
    const cut = sameDaysCut('2026-03', '2026-03-10')!
    expect(withinCut('2026-02-27', '2026-03', cut)).toBe(true)
  })
})

describe('spendThroughCut', () => {
  const txns = [
    txn({ id: 1, date: '2026-01-05', amountCents: 10000 }),
    txn({ id: 2, date: '2026-01-20', amountCents: 5000 }),
    txn({ id: 3, date: '2026-01-10', type: 'refund', amountCents: 2000 }),
    txn({ id: 4, date: '2026-01-08', amountCents: 7000, status: 'forecast' }),
    txn({ id: 5, date: '2026-02-02', budgetMonth: '2026-02', amountCents: 9999 }),
  ]
  const day15 = sameDaysCut('2026-01', '2026-01-15')

  it('nets refunds and respects the cut', () => {
    expect(spendThroughCut(txns, '2026-01', day15, 'committed')).toBe(10000 - 2000 + 7000)
    expect(spendThroughCut(txns, '2026-01', null, 'committed')).toBe(10000 + 5000 - 2000 + 7000)
  })

  it('leaves forecast charges out on the paid basis', () => {
    expect(spendThroughCut(txns, '2026-01', null, 'paid')).toBe(10000 + 5000 - 2000)
  })
})

describe('unpaidExpenseCents', () => {
  it('sums only forecast expense net of forecast refunds', () => {
    const txns = [
      txn({ id: 1, amountCents: 10000 }),
      txn({ id: 2, amountCents: 7000, status: 'forecast' }),
      txn({ id: 3, type: 'refund', amountCents: 1000, status: 'forecast' }),
    ]
    expect(unpaidExpenseCents(txns, '2026-01')).toBe(6000)
  })
})
