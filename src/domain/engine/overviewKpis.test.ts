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

  it('clamps by the rollover-aware open month when one is given', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-03',
      period: 'month',
      compare: 'prevMonth',
      basis: 'committed',
      // Feb 28 with a rollover day already puts March's budget month under way.
      today: '2026-02-28',
      openMonth: '2026-03',
    })
    expect(k.openDayLimit).toBe(28)
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

  it('sums the window for ytd and baselines it against the window before', () => {
    const k = computeOverviewKpis(TXNS, {
      months: MONTHS,
      month: '2026-02',
      period: 'ytd',
      compare: 'prevMonth',
      basis: 'committed',
      today: '2026-04-17',
    })
    expect(k.current.spendCents).toBe(100000 + 120000)
    // The two months before Jan–Feb are Nov–Dec 2025; Nov is missing, so no baseline.
    expect(k.baseline).toBeNull()
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
