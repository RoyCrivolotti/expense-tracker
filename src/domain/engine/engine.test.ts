import { describe, expect, it } from 'vitest'
import type { Account, AccountStatement, Transaction } from '../types'
import {
  formatCents,
  formatEuroInput,
  formatMoneyInput,
  formatPercent,
  parseEuroToCents,
  parseMoneyToCents,
  parsePercentToFraction,
  resolveMoneyFormat,
} from './money'
import { budgetMonthFromName, defaultBudgetMonth, parseHumanDate, parseIsoDate } from './dates'
import { fv, nper, pmt } from './finance'
import { deriveStatus, deriveTransactions } from './status'
import { computeMonthlyTotals, investedYtdCents } from './monthlyTotals'
import { computeBudgetHealth, computeYtdBudgetHealth, sumBudgetHealth } from './categoryBudget'
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
  it('formatEuroInput matches formatCents without symbol', () => {
    expect(formatEuroInput(110)).toBe('1,10')
    expect(formatEuroInput(145660)).toBe('1.456,60')
  })
  it('treats dot as thousands separator — do not seed inputs with JS decimals', () => {
    expect(parseEuroToCents('1,10')).toBe(110)
    expect(parseEuroToCents('1.10')).toBe(11000)
    expect(parseEuroToCents('1.1')).toBe(1100)
  })
  it('parses percentages to fractions', () => {
    expect(parsePercentToFraction('40,0%')).toBeCloseTo(0.4, 6)
    expect(parsePercentToFraction('9,2%')).toBeCloseTo(0.092, 6)
  })
  it('formats fractions as EU percentages', () => {
    expect(formatPercent(0.05)).toBe('5,0%')
    expect(formatPercent(0.092)).toBe('9,2%')
  })
})

describe('money — US format', () => {
  const usd = resolveMoneyFormat('USD', 'en-US')

  it('derives a prefix symbol and dot decimal separator', () => {
    expect(usd.symbol).toBe('$')
    expect(usd.symbolPosition).toBe('prefix')
    expect(usd.decimalSeparator).toBe('.')
  })
  it('parses US currency strings to cents (dot is the decimal)', () => {
    expect(parseMoneyToCents('$1,456.60', usd)).toBe(145660)
    expect(parseMoneyToCents('1.10', usd)).toBe(110)
    expect(parseMoneyToCents('250000', usd)).toBe(25000000)
    expect(parseMoneyToCents('-639.06', usd)).toBe(-63906)
  })
  it('formats cents as US strings with a leading symbol', () => {
    expect(formatCents(145660, usd)).toBe('$1,456.60')
    expect(formatCents(-63906, usd)).toBe('-$639.06')
    expect(formatMoneyInput(110, usd)).toBe('1.10')
  })
  it('formats percentages with the locale decimal separator', () => {
    expect(formatPercent(0.05, usd)).toBe('5.0%')
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
  it('defaults budget month with a configurable rollover day', () => {
    expect(defaultBudgetMonth('2026-01-05', 13)).toBe('2026-01')
    expect(defaultBudgetMonth('2026-01-13', 13)).toBe('2026-02')
    expect(defaultBudgetMonth('2026-12-20', 13)).toBe('2027-01')
  })
  it('treats rollover day 1 as plain calendar months', () => {
    expect(defaultBudgetMonth('2026-01-05', 1)).toBe('2026-01')
    expect(defaultBudgetMonth('2026-01-31', 1)).toBe('2026-01')
    expect(defaultBudgetMonth('2026-12-20')).toBe('2026-12')
  })
  it('validates ISO calendar dates', () => {
    expect(parseIsoDate('2026-06-15')).toBe('2026-06-15')
    expect(parseIsoDate('2026-06-31')).toBeNull()
    expect(parseIsoDate('06-15-2026')).toBeNull()
  })
})

describe('finance primitives', () => {
  it('PMT amortizes a loan', () => {
    expect(pmt(0.02 / 12, 360, 240_000)).toBeCloseTo(887, 0)
  })
  it('FV compounds contributions and principal', () => {
    expect(fv(0.05, 20, 2_000 * 12, 100_000)).toBeCloseTo(1_058_912.67, 0)
  })
  it('NPER finds years to target', () => {
    expect(nper(0.05, 2_000 * 12, 100_000, 400_000)).toBeCloseTo(8.545, 2)
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

describe('investedYtdCents', () => {
  it('sums investments within calendar year through selected month', () => {
    const totals = computeMonthlyTotals([
      {
        id: 1,
        date: '2026-01-10',
        budgetMonth: '2026-01',
        description: '',
        accountId: 1,
        categoryId: 1,
        type: 'investment',
        amountCents: 100000,
        cancelled: false,
        status: 'posted',
      },
      {
        id: 2,
        date: '2026-02-10',
        budgetMonth: '2026-02',
        description: '',
        accountId: 1,
        categoryId: 1,
        type: 'investment',
        amountCents: 50000,
        cancelled: false,
        status: 'posted',
      },
      {
        id: 3,
        date: '2025-12-10',
        budgetMonth: '2025-12',
        description: '',
        accountId: 1,
        categoryId: 1,
        type: 'investment',
        amountCents: 99999,
        cancelled: false,
        status: 'posted',
      },
    ])
    expect(investedYtdCents(totals, '2026-02')).toBe(150000)
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

  it('sums YTD actuals within calendar year through selected month', () => {
    const categories = [
      { id: 1, name: 'Food', monthlyBudgetCents: 10000, sortOrder: 0, active: true },
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
        amountCents: 3000,
        cancelled: false,
        status: 'posted',
      },
      {
        id: 2,
        date: '2026-02-05',
        budgetMonth: '2026-02',
        description: '',
        accountId: 1,
        categoryId: 1,
        type: 'expense',
        amountCents: 4000,
        cancelled: false,
        status: 'posted',
      },
      {
        id: 3,
        date: '2025-12-05',
        budgetMonth: '2025-12',
        description: '',
        accountId: 1,
        categoryId: 1,
        type: 'expense',
        amountCents: 99999,
        cancelled: false,
        status: 'posted',
      },
    ]
    const [food] = computeYtdBudgetHealth(txns, categories, '2026-02')
    expect(food!.actualCents).toBe(7000)
    expect(food!.budgetCents).toBe(20000)
  })

  it('flags YTD over and warning by cumulative ratio', () => {
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
        amountCents: 550000,
        cancelled: false,
        status: 'posted',
      },
    ]
    const [warn] = computeYtdBudgetHealth(txns, categories, '2026-06')
    expect(warn!.budgetCents).toBe(600000)
    expect(warn!.status).toBe('warning')

    txns[0]!.amountCents = 650000
    const [over] = computeYtdBudgetHealth(txns, categories, '2026-06')
    expect(over!.status).toBe('over')
  })

  it('includes forecast charges in YTD when includeForecast is set', () => {
    const categories = [
      { id: 1, name: 'Groceries', monthlyBudgetCents: 50000, sortOrder: 0, active: true },
    ]
    const txns: Transaction[] = [
      {
        id: 1,
        date: '2026-03-05',
        budgetMonth: '2026-03',
        description: 'Mercadona',
        accountId: 2,
        categoryId: 1,
        type: 'expense',
        amountCents: 4500,
        cancelled: false,
        status: 'forecast',
      },
    ]
    const without = computeYtdBudgetHealth(txns, categories, '2026-03')
    expect(without[0]!.actualCents).toBe(0)
    const withForecast = computeYtdBudgetHealth(txns, categories, '2026-03', {
      includeForecast: true,
    })
    expect(withForecast[0]!.actualCents).toBe(4500)
  })

  it('sums budget health rows for a total footer', () => {
    const rows = [
      {
        categoryId: 1,
        name: 'A',
        budgetCents: 10000,
        actualCents: 9000,
        ratio: 0.9,
        status: 'warning' as const,
      },
      {
        categoryId: 2,
        name: 'B',
        budgetCents: 20000,
        actualCents: 10000,
        ratio: 0.5,
        status: 'under' as const,
      },
    ]
    const total = sumBudgetHealth(rows)
    expect(total.name).toBe('Total')
    expect(total.actualCents).toBe(19000)
    expect(total.budgetCents).toBe(30000)
    expect(total.status).toBe('under')
    expect(total.ratio).toBeCloseTo(19000 / 30000, 4)
  })
})
