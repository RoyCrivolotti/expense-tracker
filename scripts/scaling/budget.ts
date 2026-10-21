/**
 * The arithmetic behind a measurement run on a deployed database: what the Free plan allows per day, what
 * one exercise may spend of it, and what a seed of N transactions costs in rows written. Pure, so the plan
 * can be printed and checked without a token. See docs/MEASURING.md.
 */
import type { ExpenseDataset, Transaction } from '../../src/domain/types'

/** The documented Free plan limits that bind a run. Cloudflare states the daily ones for the account. */
export const FREE_PLAN = {
  rowsReadPerDay: 5_000_000,
  rowsWrittenPerDay: 100_000,
  queriesPerInvocation: 50,
  cpuMsPerRequest: 10,
} as const

/**
 * What one exercise may spend, added up over every day it runs. Writes are a quarter of one day's budget,
 * reads a tenth, because the same budget serves the production app.
 */
export const CAPS = {
  rowsWrittenTotal: 25_000,
  rowsWrittenPerDay: 15_000,
  rowsReadTotal: 500_000,
  rowsReadPerDay: 300_000,
  /** Refuse to start, and stop, once the whole account has written this many rows today (every database). */
  accountWrittenCeiling: 40_000,
  accountReadCeiling: 1_500_000,
} as const

/**
 * Indexes on `transactions` that hold every row. Each adds one written row per insert; a unit test counts
 * them in the migrated schema, so adding an index fails it until this and the docs are updated.
 */
export const FULL_INDEXES_ON_TRANSACTIONS = 7

/** Rows written for one `transaction_labels` link: the row, its UNIQUE pair and its two indexes. */
export const LABEL_LINK_WRITES = 4

/** The part of a transaction that decides which partial indexes hold it. */
export type IndexShape = Pick<
  Transaction,
  'type' | 'planId' | 'installmentIndex' | 'flagId' | 'settledBy' | 'reportCount'
>

/** Partial indexes on `transactions` that hold this row (0009, 0015, 0018 and 0037). */
export function partialIndexHits(row: IndexShape): number {
  const plan = row.planId != null
  const settled = row.settledBy != null
  const pinned =
    row.type === 'investment' || plan || row.flagId != null || settled || (row.reportCount ?? 0) > 0
  const hits = [plan && row.installmentIndex != null, plan, row.flagId != null, settled, pinned]
  return hits.filter(Boolean).length
}

/** Rows D1 reports written for one inserted transaction, without its label links. */
export function insertWrites(row: IndexShape): number {
  return 1 + FULL_INDEXES_ON_TRANSACTIONS + partialIndexHits(row)
}

/** Rows written to insert every transaction and label link of a dataset. */
export function datasetInsertWrites(dataset: Pick<ExpenseDataset, 'transactions'>): number {
  let total = 0
  for (const row of dataset.transactions) {
    total += insertWrites(row) + (row.labelIds?.length ?? 0) * LABEL_LINK_WRITES
  }
  return total
}

/** Reference rows (accounts, categories, flags, labels, plans, statements, cash) plus the revision row. */
export function referenceInsertWrites(dataset: ExpenseDataset): number {
  const small = [dataset.categories, dataset.accounts, dataset.flags, dataset.labels, dataset.installmentPlans]
  const rows = small.reduce((sum, list) => sum + list.length, 0)
  return rows * 2 + (dataset.accountStatements.length + dataset.cashActuals.length) * 2 + 2
}

/**
 * Rows written by the write routes in the measurement (a single create, a bulk create of 20, a bulk edit of
 * 50 and a bulk delete of 20, each with the revision bumps around it). An estimate; the run records the
 * real figure.
 */
export const ROUTE_WRITES_ESTIMATE = 800

/** Exactly what the plan says a seed of this dataset spends, in rows written, and when. */
export interface SeedBudget {
  transactions: number
  insertWrites: number
  /** Deleting a row is assumed to cost what inserting it did. The first chunk of the run measures it. */
  deleteWrites: number
  referenceWrites: number
  routeWrites: number
  total: number
  fitsTotalCap: boolean
  /** Day one: seed and measure. Day two (after 00:00 UTC): clean up. */
  dayOne: number
  dayTwo: number
  fitsDailyCap: boolean
}

export function seedBudget(dataset: ExpenseDataset): SeedBudget {
  const insert = datasetInsertWrites(dataset)
  const reference = referenceInsertWrites(dataset)
  const dayOne = insert + reference + ROUTE_WRITES_ESTIMATE
  const dayTwo = insert + reference
  const total = dayOne + dayTwo
  return {
    transactions: dataset.transactions.length,
    insertWrites: insert,
    deleteWrites: insert,
    referenceWrites: reference,
    routeWrites: ROUTE_WRITES_ESTIMATE,
    total,
    fitsTotalCap: total <= CAPS.rowsWrittenTotal,
    dayOne,
    dayTwo,
    fitsDailyCap: Math.max(dayOne, dayTwo) <= CAPS.rowsWrittenPerDay,
  }
}

/** Rows read by one pass over the read routes, per transaction, as estimated from the query plans. */
export const READS_PER_TRANSACTION = {
  dataset: 1.1,
  reference: 1.1,
  cube: 2,
  series: 9,
  usage: 2,
  summary: 1,
} as const

/** Rows read by one pass over every read route for a ledger of this size: the sum of the estimates above. */
export function readPassEstimate(transactions: number): number {
  const perRow = Object.values(READS_PER_TRANSACTION).reduce((sum, n) => sum + n, 0)
  return Math.round(transactions * perRow) + 5_000
}

/**
 * The largest synthetic ledger whose seed fits `cap`, by bisection over the generator. `build` makes a
 * ledger of about the requested size; the cost is read from the ledger it returns.
 */
export function largestSeed(
  build: (transactions: number) => ExpenseDataset,
  cap: number = CAPS.rowsWrittenTotal,
): { requested: number; budget: SeedBudget } {
  let low = 0
  let high = cap
  let best = { requested: 0, budget: seedBudget(build(1)) }
  while (low + 50 < high) {
    const mid = Math.floor((low + high) / 2)
    const budget = seedBudget(build(mid))
    if (budget.total <= cap) {
      best = { requested: mid, budget }
      low = mid
    } else {
      high = mid
    }
  }
  return best
}
