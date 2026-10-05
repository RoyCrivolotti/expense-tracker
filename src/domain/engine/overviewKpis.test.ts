import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import { computeOverviewKpis, totalsForMonths } from './overviewKpis'

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

function month(m: string, incomeCents: number, spendCents: number, investedCents = 0): Transaction[] {
  const rows = [
    txn({ id: Math.random(), date: `${m}-01`, budgetMonth: m, type: 'income', amountCents: incomeCents }),
    txn({ id: Math.random(), date: `${m}-10`, budgetMonth: m, amountCents: spendCents }),
  ]
  if (investedCents > 0)
    rows.push(
      txn({ id: Math.random(), date: `${m}-03`, budgetMonth: m, type: 'investment', amountCents: investedCents }),
    )
  return rows
}

const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03']
const TXNS = [
  ...month('2025-12', 300000, 150000),
  ...month('2026-01', 300000, 100000, 50000),
  ...month('2026-02', 300000, 120000),
  ...month('2026-03', 300000, 60000),
]

describe('totalsForMonths', () => {
  it('computes income, spend, saved, invested and the savings rate', () => {
    const t = totalsForMonths(TXNS, ['2026-01'], null, 'committed')
    expect(t.incomeCents).toBe(300000)
    expect(t.spendCents).toBe(100000)
    expect(t.savedCents).toBe(200000)
    expect(t.investedCents).toBe(50000)
    expect(t.rate).toBeCloseTo(2 / 3, 5)
  })

  it('has a null rate with no income — never a division by zero', () => {
    const t = totalsForMonths([txn({})], ['2026-01'], null, 'committed')
    expect(t.rate).toBeNull()
  })
})

describe('computeOverviewKpis', () => {
  it('compares a closed month full against full with prevMonth', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-02',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-03-17',
    })
    expect(k.openDayLimit).toBeNull()
    expect(k.current.spendCents).toBe(120000)
    expect(k.baseline?.spendCents).toBe(100000)
  })

  it('compares the open month only against the same days (both sides clamped)', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-03',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-03-05',
    })
    expect(k.openDayLimit).toBe(5)
    // The day-10 spends fall outside day 5 on both sides; income on the 1st stays.
    expect(k.current.spendCents).toBe(0)
    expect(k.baseline?.spendCents).toBe(0)
    expect(k.baseline?.incomeCents).toBe(300000)
  })

  it('leaves a future month whole instead of clamping it to today', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-03',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-02-05',
      openMonth: '2026-02',
    })
    // March is ahead of the open month, not open itself: no same-days cut.
    expect(k.openDayLimit).toBeNull()
    expect(k.current.spendCents).toBe(60000)
  })

  it('cuts the open month by days since it began, not by day of the calendar month', () => {
    // Day-13 rollover on Mar 5: March's budget month began Feb 13, so Feb 20 is inside it.
    const rows = [
      txn({ id: 1, date: '2026-02-20', budgetMonth: '2026-03', amountCents: 1000 }),
      txn({ id: 2, date: '2026-03-04', budgetMonth: '2026-03', amountCents: 2000 }),
      txn({ id: 3, date: '2026-03-08', budgetMonth: '2026-03', amountCents: 4000 }),
      txn({ id: 4, date: '2026-01-20', budgetMonth: '2026-02', amountCents: 500 }),
      txn({ id: 5, date: '2026-02-05', budgetMonth: '2026-02', amountCents: 700 }),
    ]
    const k = computeOverviewKpis(rows, {
      months: ['2026-02', '2026-03'],
      month: '2026-03',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-03-05',
      openMonth: '2026-03',
      rolloverDay: 13,
    })
    expect(k.openDayLimit).toBe(21)
    expect(k.current.spendCents).toBe(3000)
    // February's budget month began Jan 13, so day 21 of it ends on Feb 2: the Feb 5 row is out.
    expect(k.baseline?.spendCents).toBe(500)
  })

  it('still finds the month before when the viewed month is past the data edge', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-05',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-05-10',
    })
    // 2026-05 is not in months; the newest month below it is still the baseline.
    expect(k.baseline?.spendCents).toBe(60000)
  })

  it('averages the three closed months before with avg3', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-03',
      period: 'month',
      compare: 'avg3',
      basis: 'committed',
      today: '2026-04-17',
    })
    expect(k.baseline?.spendCents).toBe(Math.round((150000 + 100000 + 120000) / 3))
  })

  it('has no prevYear baseline when history does not reach back', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-02',
      period: 'month',
      compare: 'prevYear',
      basis: 'committed',
      today: '2026-04-17',
    })
    expect(k.baseline).toBeNull()
  })

  it('sums the window for ytd and baselines it against the same months a year earlier', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-02',
      period: 'ytd',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-04-17',
    })
    expect(k.current.spendCents).toBe(100000 + 120000)
    // Jan and Feb 2025 are not in the data, so there is nothing to compare against.
    expect(k.baseline).toBeNull()
  })

  describe('window baselines', () => {
    const twoYears = [
      ...month('2025-01', 300000, 80000),
      ...month('2025-02', 300000, 90000),
      ...month('2025-03', 300000, 70000),
      ...month('2025-04', 300000, 70000),
      ...month('2026-01', 300000, 100000),
      ...month('2026-02', 300000, 110000),
      ...month('2026-03', 300000, 60000),
    ]
    const all = ['2025-01', '2025-02', '2025-03', '2025-04', '2026-01', '2026-02', '2026-03']
    const opts = { months: all, compare: 'prevMonth' as const, basis: 'committed' as const }

    it('sets year to date against the same months last year', () => {
      const k = computeOverviewKpis(twoYears, { ...opts, month: '2026-02', period: 'ytd', today: '2026-04-17' })
      expect(k.current.spendCents).toBe(100000 + 110000)
      expect(k.baseline?.spendCents).toBe(80000 + 90000)
    })

    it('sets the last twelve months against the twelve before them', () => {
      const k = computeOverviewKpis(twoYears, { ...opts, month: '2026-01', period: 'last12', today: '2026-04-17' })
      // Twelve months back from Jan 2026 reach Feb 2025, which has no counterpart year earlier.
      expect(k.baseline).toBeNull()
    })

    it('does not overlap the window with its baseline across a gap in the data', () => {
      const gap = ['2025-01', '2025-03', '2026-01', '2026-03']
      const rows = [
        ...month('2025-01', 300000, 80000),
        ...month('2025-03', 300000, 70000),
        ...month('2026-01', 300000, 100000),
        ...month('2026-03', 300000, 60000),
      ]
      const k = computeOverviewKpis(rows, { ...opts, months: gap, month: '2026-03', period: 'ytd', today: '2026-06-01' })
      expect(k.current.spendCents).toBe(100000 + 60000)
      expect(k.baseline?.spendCents).toBe(80000 + 70000)
    })

    it('cuts the open month and its counterpart at the same days', () => {
      const rows = [
        ...twoYears.filter((t) => t.budgetMonth !== '2026-03' && t.budgetMonth !== '2025-03'),
        txn({ id: 901, date: '2026-03-04', budgetMonth: '2026-03', amountCents: 5000 }),
        txn({ id: 902, date: '2026-03-20', budgetMonth: '2026-03', amountCents: 9000 }),
        txn({ id: 903, date: '2025-03-03', budgetMonth: '2025-03', amountCents: 4000 }),
        txn({ id: 904, date: '2025-03-25', budgetMonth: '2025-03', amountCents: 8000 }),
      ]
      const k = computeOverviewKpis(rows, { ...opts, month: '2026-03', period: 'ytd', today: '2026-03-10' })
      expect(k.openDayLimit).toBe(10)
      expect(k.current.spendCents).toBe(100000 + 110000 + 5000)
      expect(k.baseline?.spendCents).toBe(80000 + 90000 + 4000)
    })
  })

  it('serves up to twelve full months for the sparklines', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-03',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-03-17',
    })
    expect(k.series.map((s) => s.month)).toEqual(MONTHS)
    expect(k.series[1]?.totals.investedCents).toBe(50000)
  })
})
