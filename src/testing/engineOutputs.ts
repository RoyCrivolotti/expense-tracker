/**
 * Each consumer in docs/ENGINE-HISTORY.md, run the way the screen runs it, over the row lists a ledger
 * hands out. `outputs(ds, lists, ...)` returns one thunk per consumer, so a test can run the same
 * consumers over the whole ledger and over the assembled lists and compare the results.
 *
 * Engines that only add amounts (class S), the list of months, and the spending groups and their detail
 * (a 12 month trend of sums beside the rows of the viewed month) read `lists.linear`. Engines that read
 * dates, descriptions, labels or links (R, P, X) and the global lists read `lists.real`.
 */
import type { ExpenseDataset } from '../domain/types'
import { type OccurrenceGroup, classifyFixedSpend, sortedMonths } from '../domain/engine'
import {
  BASES,
  COMPARES,
  type Classifier,
  type Clock,
  type Context,
  type Lists,
  NOW,
  type Outputs,
  PERIODS,
  plain,
} from './outputContext'
import { linkedOutputs, rowOutputs } from './rowOutputs'
import { kpiOutputs, sumOutputs } from './sumOutputs'

export { type Clock, type Lists, type Outputs, LATER, NOW, openAt, plain, wholeLedger } from './outputContext'

/**
 * The classifier always comes from the full ledger, because a window cannot rebuild it. Four engines
 * build their own from the rows they are given (spending groups, group detail, the pace envelope and
 * fixed costs). Without `groups`, those four do so here too, and the keys whose output changes on a
 * window are `groupsByFixedFlexible`, `detailByFixedFlexible`, `fixedCosts` and, when a monthly series
 * has fewer than three rows in the window, `pace`. With `groups`, the recurring series of the full
 * ledger, they are handed it and the classifier instead.
 */
export function outputs(
  ds: ExpenseDataset,
  lists: Lists,
  viewed: string,
  classifier: Classifier,
  clock: Clock = NOW,
  groups?: OccurrenceGroup[],
): Outputs {
  const months = sortedMonths(lists.linear.map((t) => t.budgetMonth))
  const rolloverDay = ds.settings.budgetRolloverDay
  const c: Context = { ds, ...lists, viewed, clock, months, classifier, groups, base: { month: viewed, ...clock, rolloverDay } }
  return { ...sumOutputs(c), ...kpiOutputs(c), ...rowOutputs(c), ...linkedOutputs(c) }
}

export const SUMS_ONLY = [
  'categoryActualsPaid',
  'goalsFlows',
  'monthlyTotals:committed',
  'monthlyTotals:paid',
  'categoryActuals',
  'budgetHealth',
  'ytdBudgetHealth',
  'investedYtd',
  'yearlyOverview',
  'cashRows',
  'balancesAtCost',
  'statementPayments',
  'cashReserveSpend',
  'paceMonths',
  'unpaid',
  'baseline:committed',
  'baseline:paid',
]

export const KPI_KEYS = BASES.flatMap((b) => PERIODS.flatMap((p) => COMPARES.map((c) => `kpis:${p}:${c}:${b}`)))

/** Consumers that follow rows by link or exact date: pinned rows keep them whole. */
export const LINKED_KEYS = [
  'portfolioReturn',
  'readReturn',
  'splitGap',
  'flagGroups',
  'pastReports',
  'links',
  'planProgress',
  'installments',
]

/** Row readers whose output a 13 month window keeps whole, given the classifier from the full ledger. */
export const ROW_READERS = [
  'allocation',
  'pace',
  'movers',
  'groupsByCategory',
  'groupsByLabel',
  'groupsByDescription',
  'detailByLabel',
  'detailByDescription',
]

/**
 * Compares the named consumers over two sets of lists and returns the keys that differ. The classifier
 * defaults to one built from the full ledger's rows; pass it in to build it once for many comparisons.
 * Pass `groups` (the recurring series of the full ledger) to hand the engines that build their own
 * classifier or series the whole ledger's instead; without it they build them from the rows they get.
 */
export function differing(
  ds: ExpenseDataset,
  viewed: string,
  full: Lists,
  small: Lists,
  keys: string[],
  options: { clock?: Clock; classifier?: Classifier; groups?: OccurrenceGroup[] } = {},
): string[] {
  const { clock = NOW, classifier = classifyFixedSpend(full.real), groups } = options
  const a = outputs(ds, full, viewed, classifier, clock, groups)
  const b = outputs(ds, small, viewed, classifier, clock, groups)
  return keys.filter((k) => JSON.stringify(plain(a[k]!())) !== JSON.stringify(plain(b[k]!())))
}
