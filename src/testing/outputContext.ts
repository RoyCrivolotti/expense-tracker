import type { AnalyticsBasis, AnalyticsPeriod, CompareMode, classifyFixedSpend } from '../domain/engine'
import type { ExpenseDataset, Transaction } from '../domain/types'

/**
 * The two row lists a ledger hands the engines (see `LedgerRows`). For the whole ledger they are the
 * same rows.
 */
export interface Lists {
  linear: Transaction[]
  real: Transaction[]
}

/** The clock a screen reads: today, and the budget month today falls in. */
export interface Clock {
  today: string
  openMonth: string
}

export const NOW: Clock = { today: '2026-09-15', openMonth: '2026-09' }

/** A clock after every month a test ledger has, so no month shown is the open one. */
export const LATER: Clock = { today: '2030-01-15', openMonth: '2030-01' }

/** A clock in which `month` is the open month, for any rollover day up to the 15th. */
export const openAt = (month: string): Clock => ({ today: `${month}-15`, openMonth: month })

export type Outputs = Record<string, () => unknown>
export type Classifier = ReturnType<typeof classifyFixedSpend>

export const wholeLedger = (ds: ExpenseDataset): Lists => ({ linear: ds.transactions, real: ds.transactions })

export const BASES: AnalyticsBasis[] = ['committed', 'paid']
export const PERIODS: AnalyticsPeriod[] = ['month', 'ytd', 'last12']
export const COMPARES: CompareMode[] = ['prevMonth', 'avg3', 'prevYear']

/** What every consumer needs to know to run the way a screen runs it. */
export interface Context {
  ds: ExpenseDataset
  linear: Transaction[]
  real: Transaction[]
  viewed: string
  clock: Clock
  /** The budget months with a row, from the linear list: what the month picker steps through. */
  months: string[]
  classifier: Classifier
  base: { month: string; today: string; openMonth: string; rolloverDay: number }
}

/** Maps and sets in a stable order, so two outputs compare by value. */
export function plain(v: unknown): unknown {
  if (v instanceof Map) {
    return [...v.entries()]
      .map(([k, x]) => [plain(k), plain(x)])
      .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])))
  }
  if (v instanceof Set) return [...v].sort().map(plain)
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => typeof x !== 'function')
        .map(([k, x]) => [k, plain(x)]),
    )
  }
  return v
}
