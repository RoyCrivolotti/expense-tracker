/**
 * Every viewed month of a 60 month adversarial ledger, with the consumers of docs/ENGINE-HISTORY.md
 * run over every row and over the lists assembled from a 13 month window, once with every viewed month
 * closed and once with it as the open month (so the same-days cut applies). The only differences allowed
 * are the ones written down in `INTENDED_DIFFERENCES`.
 */
import { describe, expect, it } from 'vitest'
import { classifyFixedSpend, recurringFixedGroups, sortedMonths } from '../domain/engine'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, assembleRows, ledgerFor } from '../domain/ledger'
import { buildExpenseModel } from '../ui/buildExpenseModel'
import { buildOverviewData } from '../ui/analytics/overview/overviewModel'
import { ADVERSARIAL_ROLLOVER_DAY, adversarialLedger } from './adversarialLedger'
import { LATER, differing, openAt, outputs, plain, wholeLedger } from './engineOutputs'
import {
  GLOBAL_DIFFERENCES,
  INTENDED_DIFFERENCES,
  ONLY_WHILE_OPEN,
  PACE_ENVELOPE_FIELDS,
} from './intendedDifferences'

const ds = adversarialLedger()
const whole = wholeLedger(ds)
const classifier = classifyFixedSpend(ds.transactions)
const groups = recurringFixedGroups(ds.transactions)
const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
const KEYS = Object.keys(outputs(ds, whole, months[0]!, classifier))

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const clockFor = (mode: 'closed' | 'open', month: string) => (mode === 'closed' ? LATER : openAt(month))

/**
 * For each consumer, the viewed months in which the assembled lists gave a different answer. With
 * `history`, the engines that build their own classifier or series are handed the whole ledger's.
 */
function sweep(mode: 'closed' | 'open', policy?: HydrationPolicy, history = false): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  for (const month of months) {
    const small = assembleRows(policy ? ledgerFor(ds, month, policy) : ledgerFor(ds, month))
    const options = { clock: clockFor(mode, month), classifier, ...(history ? { groups } : {}) }
    for (const key of differing(ds, month, whole, small, KEYS, options)) {
      seen.set(key, [...(seen.get(key) ?? []), month])
    }
  }
  return seen
}

describe('the adversarial ledger', () => {
  it('has what it was built to have', () => {
    const tx = ds.transactions
    expect(ds.settings.budgetRolloverDay).toBe(ADVERSARIAL_ROLLOVER_DAY)
    expect(tx.some((t) => t.date.slice(0, 7) !== t.budgetMonth && t.planId == null)).toBe(true)
    expect(tx.some((t) => t.planId != null)).toBe(true)
    expect(tx.some((t) => t.flagId != null && t.budgetMonth < '2022-01')).toBe(true)
    expect(tx.some((t) => t.description === 'Water bill')).toBe(true)
    expect(tx.some((t) => t.description === 'Car insurance')).toBe(true)
    const live = new Set(tx.filter((t) => !t.cancelled).map((t) => t.budgetMonth))
    expect(months.filter((m) => !live.has(m)).length).toBeGreaterThanOrEqual(3)
    const gaps = months.filter((m, i) => i > 0 && sortedMonths([months[i - 1]!, m]).length === 2 && m !== nextMonth(months[i - 1]!))
    expect(gaps.length).toBeGreaterThanOrEqual(2)
    expect(months.length).toBeGreaterThanOrEqual(50)
  })
})

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

describe.each(['closed', 'open'] as const)('viewed-month sweep, %s month', (mode) => {
  const windowed = sweep(mode, WINDOWED)

  it('differs from the whole ledger only where intended, and every intended difference shows up', () => {
    const intended = Object.keys(INTENDED_DIFFERENCES).filter((k) => mode === 'open' || !ONLY_WHILE_OPEN.includes(k))
    expect([...windowed.keys()].sort()).toEqual(intended.sort())
  })

  it('differs in the spending pace only in the fields the envelope feeds', () => {
    for (const month of months) {
      const small = assembleRows(ledgerFor(ds, month, WINDOWED))
      const run = (lists: typeof whole) => {
        const pace = outputs(ds, lists, month, classifier, clockFor(mode, month)).pace!() as Record<string, unknown>
        return plain(Object.fromEntries(Object.entries(pace).filter(([k]) => !PACE_ENVELOPE_FIELDS.includes(k))))
      }
      expect(run(small)).toEqual(run(whole))
    }
  })

  it('differs only in the global lists once the classifier and series of the whole history are passed in', () => {
    expect([...sweep(mode, WINDOWED, true).keys()].sort()).toEqual(Object.keys(GLOBAL_DIFFERENCES).sort())
  })

  it('is exactly today\'s behaviour under the default size policy', () => {
    expect([...sweep(mode).keys()]).toEqual([])
  })
})

describe('the newest rows', () => {
  it('are held by the window around the newest month and by no window a year back', () => {
    const newest = months.at(-1)!
    const lists = (month: string) => assembleRows(ledgerFor(ds, month, WINDOWED))
    const lists_ = ['latestEight', 'recentlyAdded']
    expect(differing(ds, newest, whole, lists(newest), lists_, { clock: LATER, classifier })).toEqual([])
    expect(differing(ds, months.at(-14)!, whole, lists(months.at(-14)!), lists_, { clock: LATER, classifier })).toEqual(lists_)
  })
})

describe('the Overview screen model', () => {
  const modelFrom = (rows: typeof ds.transactions) => buildExpenseModel({ ...ds, transactions: rows })
  const overview = (rows: typeof ds.transactions, month: string) =>
    buildOverviewData(modelFrom(rows), { month, period: 'month', compare: 'prevMonth', basis: 'committed', ...openAt(month) })

  it('matches in the KPIs, baseline and unpaid caps, and differs only where a classifier is built from the rows', () => {
    const differs = new Map<string, number>()
    for (const month of months) {
      const { linear } = assembleRows(ledgerFor(ds, month, WINDOWED))
      const a = overview(ds.transactions, month) as unknown as Record<string, unknown>
      const b = overview(linear, month) as unknown as Record<string, unknown>
      for (const key of Object.keys(a)) {
        if (JSON.stringify(plain(a[key])) !== JSON.stringify(plain(b[key]))) differs.set(key, (differs.get(key) ?? 0) + 1)
      }
    }
    // The model builds its classifier from the rows it is handed, so everything that reads one can differ.
    expect([...differs.keys()].sort()).toEqual(['allocation', 'fixedCosts', 'movers', 'pace', 'signals'].sort())
  })
})
