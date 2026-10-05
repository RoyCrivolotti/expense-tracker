import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import {
  basisOptions,
  monthsForPeriod,
  sameDaysLimit,
  spendThroughDay,
  unpaidExpenseCents,
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

describe('sameDaysLimit', () => {
  it('clamps the open month to today and leaves closed months whole', () => {
    expect(sameDaysLimit('2026-03', '2026-03-17')).toBe(17)
    expect(sameDaysLimit('2026-02', '2026-03-17')).toBeNull()
  })

  it('leaves future months whole — only the one open month is partial', () => {
    expect(sameDaysLimit('2026-04', '2026-03-17')).toBeNull()
  })

  it('takes the rollover-aware open month over the calendar one', () => {
    // On March 28 with a rollover day the budget month under way is April.
    expect(sameDaysLimit('2026-04', '2026-03-28', '2026-04')).toBe(28)
    expect(sameDaysLimit('2026-03', '2026-03-28', '2026-04')).toBeNull()
  })
})

describe('spendThroughDay', () => {
  const txns = [
    txn({ id: 1, date: '2026-01-05', amountCents: 10000 }),
    txn({ id: 2, date: '2026-01-20', amountCents: 5000 }),
    txn({ id: 3, date: '2026-01-10', type: 'refund', amountCents: 2000 }),
    txn({ id: 4, date: '2026-01-08', amountCents: 7000, status: 'forecast' }),
    txn({ id: 5, date: '2026-02-02', budgetMonth: '2026-02', amountCents: 9999 }),
  ]

  it('nets refunds and respects the day cutoff', () => {
    expect(spendThroughDay(txns, '2026-01', 15, 'committed')).toBe(10000 - 2000 + 7000)
    expect(spendThroughDay(txns, '2026-01', null, 'committed')).toBe(10000 + 5000 - 2000 + 7000)
  })

  it('leaves forecast charges out on the paid basis', () => {
    expect(spendThroughDay(txns, '2026-01', null, 'paid')).toBe(10000 + 5000 - 2000)
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
