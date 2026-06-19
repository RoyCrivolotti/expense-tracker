import { describe, expect, it } from 'vitest'
import type { Account, AccountStatement, Transaction } from '../types'
import { formatCents, parseEuroToCents, parsePercentToFraction } from './money'
import { budgetMonthFromName, defaultBudgetMonth, parseHumanDate } from './dates'
import { fv, nper, pmt } from './finance'
import { deriveStatus, deriveTransactions } from './status'
import { computeMonthlyTotals } from './monthlyTotals'
import { computeBudgetHealth } from './categoryBudget'
import { netSpendCents } from './transactions'

describe('money', () => {
  it('parses EU currency strings to cents', () => {
    expect(parseEuroToCents('1.456,60 €')).toBe(145660)
    expect(parseEuroToCents('250000')).toBe(25000000)
    expect(parseEuroToCents('-639,06')).toBe(-63906)
    expect(parseEuroToCents('44,4')).toBe(4440)
    expect(parseEuroToCents('0,00 €')).toBe(0)
    expect(parseEuroToCents('')).toBe(0)
  })
  it('formats cents back to EU strings', () => {
    expect(formatCents(145660)).toBe('1.456,60 €')
    expect(formatCents(-63906)).toBe('-639,06 €')
  })
  it('parses percentages to fractions', () => {
    expect(parsePercentToFraction('40,0%')).toBeCloseTo(0.4, 6)
    expect(parsePercentToFraction('9,2%')).toBeCloseTo(0.092, 6)
  })
})

describe('dates', () => {
  it('parses human dates to ISO', () => {
    expect(parseHumanDate('23 Oct 2025')).toBe('2025-10-23')
    expect(parseHumanDate('1 Jan 2026')).toBe('2026-01-01')
  })
  it('maps budget month names to YYYY-MM', () => {
    expect(budgetMonthFromName('January', 2026)).toBe('2026-01')
    expect(budgetMonthFromName('June', 2026)).toBe('2026-06')
  })
  it('defaults budget month with a 13th rollover', () => {
    expect(defaultBudgetMonth('2026-01-05')).toBe('2026-01')
    expect(defaultBudgetMonth('2026-01-13')).toBe('2026-02')
    expect(defaultBudgetMonth('2026-12-20')).toBe('2027-01')
  })
})

describe('finance primitives (match workbook live calcs)', () => {
  it('PMT reproduces the mortgage payment', () => {
    expect(pmt(0.02 / 12, 360, 315000)).toBeCloseTo(1164.3, 1)
  })
  it('FV reproduces the projected portfolio', () => {
    expect(fv(0.05, 20, 1849.47 * 12, 272500)).toBeCloseTo(1500000, -2)
  })
  it('NPER reproduces years to the long-term target', () => {
    expect(nper(0.05, 1849.47 * 12, 272500, 400000)).toBeCloseTo(3.357, 2)
  })
})

const debit: Account = {
  id: 1,
  name: 'Santander Debit',
  kind: 'debit',
  settlement: 'immediate',
  active: true,
}
const card: Account = {
  id: 2,
  name: 'Iberia Icon',
  kind: 'credit',
  settlement: 'deferred',
  active: true,
}

describe('status derivation', () => {
  const statements: AccountStatement[] = [{ accountId: 2, yearMonth: '2026-01', paid: true }]
  const base = {
    id: 1,
    date: '2026-01-05',
    budgetMonth: '2026-01',
    description: '',
    categoryId: 1,
    type: 'expense' as const,
    amountCents: 1000,
    cancelled: false,
  }

  it('debit is always posted', () => {
    expect(deriveStatus({ ...base, accountId: 1 }, debit, [])).toBe('posted')
  })
  it('deferred card is posted only when the month is paid', () => {
    expect(deriveStatus({ ...base, accountId: 2 }, card, statements)).toBe('posted')
    expect(deriveStatus({ ...base, accountId: 2, budgetMonth: '2026-02' }, card, statements)).toBe(
      'forecast',
    )
  })
  it('cancelled wins regardless of account', () => {
    expect(deriveStatus({ ...base, accountId: 1, cancelled: true }, debit, [])).toBe('cancelled')
  })
})

describe('monthly totals', () => {
  const stored = [
    {
      id: 1,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Salary',
      accountId: 1,
      categoryId: 9,
      type: 'income' as const,
      amountCents: 450000,
      cancelled: false,
    },
    {
      id: 2,
      date: '2026-01-05',
      budgetMonth: '2026-01',
      description: 'Rent',
      accountId: 1,
      categoryId: 1,
      type: 'expense' as const,
      amountCents: 145660,
      cancelled: false,
    },
    {
      id: 3,
      date: '2026-01-06',
      budgetMonth: '2026-01',
      description: 'Refund',
      accountId: 2,
      categoryId: 1,
      type: 'refund' as const,
      amountCents: 5660,
      cancelled: false,
    },
    {
      id: 4,
      date: '2026-02-10',
      budgetMonth: '2026-02',
      description: 'Future card',
      accountId: 2,
      categoryId: 1,
      type: 'expense' as const,
      amountCents: 10000,
      cancelled: false,
    },
  ]
  const txns = deriveTransactions(
    stored,
    [debit, card],
    [{ accountId: 2, yearMonth: '2026-01', paid: true }],
  )

  it('nets refunds and excludes forecast/unpaid card charges', () => {
    const totals = computeMonthlyTotals(txns)
    const jan = totals.get('2026-01')!
    expect(jan.incomeCents).toBe(450000)
    expect(jan.expensesCents).toBe(145660 - 5660)
    expect(jan.netSavingCents).toBe(450000 - 140000)
    // Feb card charge is unpaid -> forecast -> excluded from posted totals.
    expect(totals.get('2026-02')).toBeUndefined()
  })
})

describe('netSpendCents', () => {
  it('sums expenses minus refunds and skips income and investments', () => {
    const txns = [
      { type: 'expense' as const, amountCents: 10000 },
      { type: 'refund' as const, amountCents: 2000 },
      { type: 'investment' as const, amountCents: 50000 },
      { type: 'income' as const, amountCents: 80000 },
    ]
    expect(netSpendCents(txns as never)).toBe(8000)
  })
})

describe('budget health', () => {
  it('flags over/warning/under by ratio', () => {
    const categories = [
      { id: 1, name: 'Home', monthlyBudgetCents: 100000, sortOrder: 0, active: true },
    ]
    const txns: Transaction[] = [
      {
        id: 1,
        date: '2026-01-05',
        budgetMonth: '2026-01',
        description: '',
        accountId: 1,
        categoryId: 1,
        type: 'expense',
        amountCents: 110000,
        cancelled: false,
        status: 'posted',
      },
    ]
    const [home] = computeBudgetHealth(txns, categories, '2026-01')
    expect(home!.status).toBe('over')
    expect(home!.ratio).toBeCloseTo(1.1, 2)
  })

  it('includes forecast charges when includeForecast is set', () => {
    const categories = [
      { id: 1, name: 'Groceries', monthlyBudgetCents: 50000, sortOrder: 0, active: true },
    ]
    const txns: Transaction[] = [
      {
        id: 1,
        date: '2026-07-05',
        budgetMonth: '2026-07',
        description: 'Mercadona',
        accountId: 2,
        categoryId: 1,
        type: 'expense',
        amountCents: 4500,
        cancelled: false,
        status: 'forecast',
      },
    ]
    const without = computeBudgetHealth(txns, categories, '2026-07')
    expect(without[0]!.actualCents).toBe(0)
    const withForecast = computeBudgetHealth(txns, categories, '2026-07', { includeForecast: true })
    expect(withForecast[0]!.actualCents).toBe(4500)
  })
})
