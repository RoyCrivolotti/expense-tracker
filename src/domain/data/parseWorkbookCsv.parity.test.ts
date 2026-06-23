/**
 * Parity test: the compute engine must reproduce the workbook's own summary
 * figures for the months where the new (derived-status) model and the old
 * (manual-status) model agree — Jan–Apr 2026, where every card statement is
 * paid and there are no manually-flagged forecast rows.
 *
 * The source CSV lives in the private finance-review repo and is never committed
 * here, so this test self-skips when the file is absent (e.g. in CI).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEuroToCents } from '../engine/money'
import { computeCategoryActuals } from '../engine/categoryBudget'
import { computeMonthlyTotals } from '../engine/monthlyTotals'
import { computeCashReconciliation } from '../engine/cashReconciliation'
import { computeGoals } from '../engine/goals'
import { parseWorkbookCsv } from './parseWorkbookCsv'
import { splitLine } from './csvSections'

const csvPath = join(
  process.env.FINANCIAL_REVIEW_DIR || join(homedir(), 'Repos', 'personal', 'finance-review'),
  'data',
  'expenses_v3.csv',
)
const hasData = existsSync(csvPath)
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04'] as const
const TOL = 2 // cents

function expectedMonthlyTotals(rows: string[][]): Map<string, number[]> {
  const start = rows.findIndex((f) => f[0] === 'Month' && f[1] === 'Income' && f[2] === 'Expenses')
  const out = new Map<string, number[]>()
  for (let i = start + 1; i < rows.length; i++) {
    const f = rows[i]!
    const m = ['jan', 'feb', 'mar', 'apr', 'may', 'jun'].indexOf((f[0] ?? '').toLowerCase())
    if (m < 0) break
    const ym = `2026-${String(m + 1).padStart(2, '0')}`
    out.set(
      ym,
      [f[1], f[2], f[3], f[4]].map((c) => parseEuroToCents(c ?? '0')),
    )
  }
  return out
}

/** Cash Reconciliation sheet: Expected Cash (col 9) and Gap (col 11) per month. */
function expectedRecon(rows: string[][]): Map<string, { expected: number; gap: number | null }> {
  const start = rows.findIndex((f) => f[0] === 'Month' && f[1] === 'Iberia Paid?')
  const out = new Map<string, { expected: number; gap: number | null }>()
  for (let i = start + 1; i < rows.length; i++) {
    const f = rows[i]!
    const m = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul'].indexOf(
      (f[0] ?? '').slice(0, 3).toLowerCase(),
    )
    if (m < 0) break
    const gapRaw = (f[11] ?? '').trim()
    out.set(`2026-${String(m + 1).padStart(2, '0')}`, {
      expected: parseEuroToCents(f[9] ?? '0'),
      gap: gapRaw === '' ? null : parseEuroToCents(gapRaw),
    })
  }
  return out
}

describe.skipIf(!hasData || process.env.PARITY_TESTS !== '1')('workbook parity (Jan–Apr 2026)', () => {
  const text = hasData ? readFileSync(csvPath, 'utf8') : ''
  const rows = text.split(/\r?\n/).map(splitLine)
  const dataset = parseWorkbookCsv(text)
  const totals = computeMonthlyTotals(dataset.transactions)
  const expected = expectedMonthlyTotals(rows)
  const recon = new Map(
    computeCashReconciliation(
      dataset.transactions,
      dataset.accounts,
      dataset.settings,
      dataset.cashActuals,
    ).map((r) => [r.month, r]),
  )
  const reconExpected = expectedRecon(rows)

  it.each(MONTHS)('expected cash matches the workbook for %s', (month) => {
    expect(
      Math.abs(recon.get(month)!.expectedCashCents - reconExpected.get(month)!.expected),
    ).toBeLessThanOrEqual(TOL)
  })

  it.each(['2026-05', '2026-06'])('reconciliation gap matches for %s', (month) => {
    const row = recon.get(month)!
    expect(row.gapCents).not.toBeNull()
    expect(Math.abs(row.gapCents! - reconExpected.get(month)!.gap!)).toBeLessThanOrEqual(TOL)
  })

  it.each(MONTHS)('monthly totals match for %s', (month) => {
    const got = totals.get(month)!
    const [income, expenses, investments, netSaving] = expected.get(month)!
    expect(Math.abs(got.incomeCents - income!)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(got.expensesCents - expenses!)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(got.investmentsCents - investments!)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(got.netSavingCents - netSaving!)).toBeLessThanOrEqual(TOL)
  })

  it('category actuals sum to the month expenses total', () => {
    const actuals = computeCategoryActuals(dataset.transactions, dataset.categories)
    for (const month of MONTHS) {
      const sum = actuals.reduce((acc, c) => acc + (c.byMonth.get(month) ?? 0), 0)
      expect(Math.abs(sum - totals.get(month)!.expensesCents)).toBeLessThanOrEqual(TOL)
    }
  })

  it('goal math reproduces the live calculations', () => {
    const goals = computeGoals(dataset.goalInputs, 184947, dataset.settings.liquidNetWorthCents)
    expect(goals.downPaymentCents).toBe(21000000)
    expect(goals.loanAmountCents).toBe(31500000)
    expect(goals.monthlyMortgageCents).toBeCloseTo(116430, -2)
    expect(goals.projectedPortfolioCents / 100).toBeCloseTo(1456878, -3)
    expect(goals.yearsToLongTermGoal).toBeCloseTo(3.357, 2)
  })
})
