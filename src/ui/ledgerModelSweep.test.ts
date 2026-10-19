/**
 * Every viewed month, with windowing forced: the readings the screens make of the model (the Overview, the
 * Spending groups and their detail, the monthly grid and the other tables) over a model built from a 13 month
 * window and the series of the whole history, held to the same readings over a model that holds every row.
 * They are the functions the views call, so this is a test of how the views are wired, not of the engines
 * (`src/testing/ledgerSweep.test.ts` is that), and a screen that handed an engine the wrong list fails here.
 *
 * What differs on purpose is the global lists (the eight newest rows, the rows added last, the list of every
 * transaction) and the description index, which are read from rows that are not held.
 */
import { describe, expect, it } from 'vitest'
import { sortedMonths } from '../domain/engine/dates'
import type { AnalyticsBasis, AnalyticsPeriod, CompareMode, SpendingGroupBy } from '../domain/engine'
import { computeCashReconciliation, computeMonthlyTotals, computeYearlyOverview } from '../domain/engine'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, ledgerFor } from '../domain/ledger'
import type { ExpenseDataset } from '../domain/types'
import { adversarialLedger } from '../testing/adversarialLedger'
import { LATER, openAt, plain } from '../testing/outputContext'
import { randomLedger } from '../testing/randomLedger'
import { syntheticLedger } from '../testing/syntheticLedger'
import { monthlySummaryRows } from './analytics/monthlySummaryRows'
import { buildOverviewData } from './analytics/overview/overviewModel'
import { spendingDetail, spendingRows } from './analytics/spending/spendingModel'
import { buildExpenseModel, sumsOf } from './buildExpenseModel'
import { buildLedgerModel, fixedHistoryOf } from './buildLedgerModel'
import type { ExpenseModel } from './useExpenseData'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const BASES: AnalyticsBasis[] = ['committed', 'paid']
const GROUPS: SpendingGroupBy[] = ['category', 'fixedFlexible', 'label', 'description']
const PERIODS: Array<[AnalyticsPeriod, CompareMode]> = [
  ['month', 'prevMonth'],
  ['ytd', 'avg3'],
  ['last12', 'prevYear'],
]
const CLOCKS = ['closed', 'open'] as const

const clockFor = (mode: (typeof CLOCKS)[number], month: string) => (mode === 'closed' ? LATER : openAt(month))

/** Both models for a viewed month: every row, and a window with the whole history's series. */
function modelsFor(dataset: ExpenseDataset, month: string, history = fixedHistoryOf(dataset.transactions)) {
  return {
    whole: buildExpenseModel(dataset),
    windowed: buildLedgerModel(ledgerFor(dataset, month, WINDOWED), { history }),
  }
}

/** What the Overview and the Spending view show for one clock, basis and view of the data. */
function screenReadings(model: ExpenseModel, month: string, mode: (typeof CLOCKS)[number], basis: AnalyticsBasis) {
  const clock = clockFor(mode, month)
  const out: Record<string, string> = {}
  for (const [period, compare] of PERIODS) {
    const overview = buildOverviewData(model, { month, period, compare, basis, ...clock })
    out[`overview:${mode}:${basis}:${period}:${compare}`] = JSON.stringify(plain(overview))
  }
  for (const groupBy of GROUPS) {
    const query = { month, basis, groupBy, ...clock }
    const rows = spendingRows(model, query)
    out[`spending:${mode}:${basis}:${groupBy}`] = JSON.stringify(plain(rows))
    const first = rows[0]
    if (!first) continue
    const detail = spendingDetail(model, { ...query, months: model.months, key: first.key })
    out[`detail:${mode}:${basis}:${groupBy}`] = JSON.stringify(plain(detail))
  }
  return out
}

/** The readings of every screen that has a viewed month, as strings that can be compared. */
function readings(model: ExpenseModel, month: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mode of CLOCKS) for (const basis of BASES) Object.assign(out, screenReadings(model, month, mode, basis))
  for (const basis of BASES) out[`summary:${basis}`] = JSON.stringify(plain(monthlySummaryRows(model, month, basis)))
  return out
}

/** The readings that take no viewed month: they must not depend on which months are real rows. */
function tables(model: ExpenseModel): Record<string, string> {
  const sums = sumsOf(model)
  const { settings, accounts, cashActuals } = model.dataset
  return {
    totals: JSON.stringify(plain(computeMonthlyTotals(sums.transactions, { includeForecast: true }))),
    yearly: JSON.stringify(plain(computeYearlyOverview(sums.transactions, settings))),
    cash: JSON.stringify(plain(computeCashReconciliation(sums.transactions, accounts, settings, cashActuals))),
  }
}

function differing(a: Record<string, string>, b: Record<string, string>): string[] {
  return Object.keys(a).filter((key) => a[key] !== b[key])
}

describe('every viewed month of the adversarial ledger, windowed', () => {
  const dataset = adversarialLedger()
  const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
  const history = fixedHistoryOf(dataset.transactions)

  it('reads the same on a window as on every row, for all 57 months', () => {
    expect(months.length).toBeGreaterThanOrEqual(50)
    const whole = buildExpenseModel(dataset)
    const wholeTables = tables(whole)
    for (const month of months) {
      const { windowed } = modelsFor(dataset, month, history)
      expect(differing(readings(whole, month), readings(windowed, month)), month).toEqual([])
      expect(differing(wholeTables, tables(windowed)), month).toEqual([])
    }
  }, 120_000)

  it('is a test with teeth: the early months really are summed, not held', () => {
    const early = buildLedgerModel(ledgerFor(dataset, months[months.length - 1]!, WINDOWED), { history })
    expect(early.sums).toBeDefined()
    expect(early.dataset.transactions.length).toBeLessThan(dataset.transactions.length / 2)
  })

  it('fails when the series of the whole history is left out', () => {
    const whole = buildExpenseModel(dataset)
    const broken = months.filter((month) => {
      const model = buildLedgerModel(ledgerFor(dataset, month, WINDOWED))
      return differing(readings(whole, month), readings(model, month)).length > 0
    })
    expect(broken.length).toBeGreaterThan(0)
  }, 120_000)

  it('fails when the engines that add amounts are given the real rows only', () => {
    const whole = buildExpenseModel(dataset)
    const month = months[months.length - 1]!
    const model = buildLedgerModel(ledgerFor(dataset, month, WINDOWED), { history })
    const withoutSums: ExpenseModel = { ...model }
    delete withoutSums.sums
    expect(differing(readings(whole, month), readings(withoutSums, month)).length).toBeGreaterThan(0)
    expect(differing(tables(whole), tables(withoutSums)).length).toBeGreaterThan(0)
  })
})

describe('a closed month with only that month held as rows', () => {
  const dataset = adversarialLedger()
  const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
  const history = fixedHistoryOf(dataset.transactions)
  const ONE_MONTH: HydrationPolicy = { fullBelowRows: 0, dataMonths: 1 }

  /** What a closed month's screens read from sums alone (docs/ENGINE-HISTORY.md, "Engines"). */
  function sumReadings(model: ExpenseModel, month: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const basis of BASES) {
      for (const [period, compare] of PERIODS) {
        const data = buildOverviewData(model, { month, period, compare, basis, ...LATER })
        out[`kpis:${basis}:${period}`] = JSON.stringify(plain(data.kpis))
        out[`baseline:${basis}:${period}`] = JSON.stringify(plain(data.baseline))
        out[`unpaid:${basis}:${period}`] = JSON.stringify(plain([...data.unpaidByMonth]))
      }
      // Rows that tie are listed in the order their category first appears, which depends on the rows held.
      const rows = spendingRows(model, { month, basis, groupBy: 'category', ...LATER })
      out[`categories:${basis}`] = JSON.stringify(plain([...rows].sort((a, b) => a.key.localeCompare(b.key))))
      out[`summary:${basis}`] = JSON.stringify(plain(monthlySummaryRows(model, month, basis)))
    }
    return out
  }

  it('reads the totals, the baseline, the unpaid caps and the category groups from the sums', () => {
    const whole = buildExpenseModel(dataset)
    for (const month of months) {
      const model = buildLedgerModel(ledgerFor(dataset, month, ONE_MONTH), { history })
      expect(differing(sumReadings(whole, month), sumReadings(model, month)), month).toEqual([])
    }
  }, 120_000)
})

describe('other ledgers, windowed', () => {
  it('reads the same for the viewed months of random ledgers', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const dataset = randomLedger(seed)
      const list = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
      const whole = buildExpenseModel(dataset)
      for (const month of [list[0], list[Math.floor(list.length / 2)], list.at(-1), '2031-01'].filter((m): m is string => !!m)) {
        const { windowed } = modelsFor(dataset, month)
        expect(differing(readings(whole, month), readings(windowed, month)), `${seed} ${month}`).toEqual([])
        expect(differing(tables(whole), tables(windowed)), `${seed} ${month}`).toEqual([])
      }
    }
  }, 120_000)

  it('reads the same for the synthetic ledger, with a short window', () => {
    const dataset = syntheticLedger({ months: 48, perMonth: 30, seed: 9 })
    const list = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
    const whole = buildExpenseModel(dataset)
    const history = fixedHistoryOf(dataset.transactions)
    for (const month of list.filter((_, i) => i % 5 === 0)) {
      const windowed = buildLedgerModel(ledgerFor(dataset, month, WINDOWED), { history })
      expect(differing(readings(whole, month), readings(windowed, month)), month).toEqual([])
    }
  }, 120_000)
})
