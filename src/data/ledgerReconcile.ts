/**
 * Puts a change made to the dataset the screens see (the real rows and the reference tables) back into
 * what is held. The patch functions in `src/ui/datasetPatches.ts` work on that dataset, so a write keeps
 * its fast path: the rows held are patched at once. What the dataset cannot say is what the change did to
 * the sums of months that are not held, so the months whose sums are no longer right are returned for the
 * caller to read again from the server, which is the only place that knows.
 */
import { referenceTablesOf } from '../domain/data/ledgerParts'
import { sortedMonths } from '../domain/engine/dates'
import { assembleRows, isPinned, ledgerDataset, settlementPaymentIds } from '../domain/ledger'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { type HeldLedger, ledgerOfHeld, wantedMonths } from './ledgerHold'

export interface Reconciled {
  held: HeldLedger
  changed: { reference: boolean; rows: boolean }
  /** Months whose sums no longer match the rows. Empty for a ledger held in full. */
  stale: string[]
}

/** The dataset the screens see for what is held: the reference and every real row. */
export function datasetOfHeld(held: HeldLedger): ExpenseDataset {
  const ledger = ledgerOfHeld(held)
  return ledgerDataset(ledger, assembleRows(ledger).real)
}

function sameRow(a: Transaction, b: Transaction): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Transaction>
  for (const key of keys) {
    const x = a[key]
    const y = b[key]
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false
    } else if (x !== y) {
      return false
    }
  }
  return true
}

/** What a sum is made of: a row that differs in none of these leaves every sum as it was. */
const CELL_FIELDS = ['budgetMonth', 'accountId', 'categoryId', 'type', 'cancelled', 'amountCents'] as const
const sameCell = (a: Transaction, b: Transaction): boolean => CELL_FIELDS.every((key) => a[key] === b[key])

function sameTables(before: ExpenseDataset, after: ExpenseDataset): boolean {
  const a = referenceTablesOf(before)
  const b = referenceTablesOf(after)
  return (Object.keys(a) as (keyof typeof a)[]).every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]))
}

const byApiOrder = (a: Transaction, b: Transaction): number =>
  a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1

interface Delta {
  counts: Map<string, number>
  stale: Set<string>
  removed: number[]
  changed: boolean
}

/** How one row's change moves the number of rows in each month. */
function countChange(b: Transaction | undefined, a: Transaction | undefined): Array<[string, number]> {
  if (!a) return b ? [[b.budgetMonth, -1]] : []
  if (!b) return [[a.budgetMonth, 1]]
  return a.budgetMonth === b.budgetMonth
    ? []
    : [
        [b.budgetMonth, -1],
        [a.budgetMonth, 1],
      ]
}

/** The months whose sums a row's change moves: where it was summed and where it is summed now. */
function staleChange(b: Transaction | undefined, a: Transaction | undefined, was: ReadonlySet<number>, now: ReadonlySet<number>): string[] {
  const summedBefore = b !== undefined && !isPinned(b, was)
  const summedAfter = a !== undefined && !isPinned(a, now)
  if (a && b && summedBefore && summedAfter && sameCell(a, b)) return []
  return [...(b && summedBefore ? [b.budgetMonth] : []), ...(a && summedAfter ? [a.budgetMonth] : [])]
}

function diffRows(before: ExpenseDataset, after: ExpenseDataset): Delta {
  const was = new Map(before.transactions.map((row) => [row.id, row]))
  const now = new Map(after.transactions.map((row) => [row.id, row]))
  const wasPayments = settlementPaymentIds(before.transactions)
  const nowPayments = settlementPaymentIds(after.transactions)
  const delta: Delta = { counts: new Map(), stale: new Set(), removed: [], changed: false }
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const b = was.get(id)
    const a = now.get(id)
    if (b && a && sameRow(b, a)) continue
    delta.changed = true
    if (!a) delta.removed.push(id)
    for (const [month, by] of countChange(b, a)) delta.counts.set(month, (delta.counts.get(month) ?? 0) + by)
    for (const month of staleChange(b, a, wasPayments, nowPayments)) delta.stale.add(month)
  }
  return delta
}

/** The month index and counts after a delta: a month with no row left is gone. */
function recount(held: HeldLedger, counts: ReadonlyMap<string, number>) {
  const rowsPerMonth = { ...held.rowsPerMonth }
  let rowCount = held.rowCount
  for (const [month, by] of counts) {
    rowsPerMonth[month] = (rowsPerMonth[month] ?? 0) + by
    rowCount += by
    if (rowsPerMonth[month] <= 0) delete rowsPerMonth[month]
  }
  return { rowsPerMonth, rowCount, months: sortedMonths(Object.keys(rowsPerMonth)) }
}

/**
 * `before` is what `datasetOfHeld` gave and `after` what a patch made of it. A month with no row before
 * that has some now is held with those rows when it is one the screens want, because they are all of
 * its rows; any other month the patch put an unpinned row in is left to the sums.
 */
export function reconcileHeld(held: HeldLedger, before: ExpenseDataset, after: ExpenseDataset, viewed: string): Reconciled {
  const reference = !sameTables(before, after)
  const delta = diffRows(before, after)
  if (!reference && !delta.changed) return { held, changed: { reference: false, rows: false }, stale: [] }
  const payments = settlementPaymentIds(after.transactions)
  const byMonth = new Map<string, Transaction[]>()
  for (const row of after.transactions) byMonth.set(row.budgetMonth, [...(byMonth.get(row.budgetMonth) ?? []), row])
  const { rowsPerMonth, rowCount, months } = recount(held, delta.counts)
  const rows = new Map<string, readonly Transaction[]>()
  for (const month of held.rows.keys()) if (months.includes(month)) rows.set(month, byMonth.get(month) ?? [])
  const next: HeldLedger = {
    ...held,
    revision: null,
    reference: referenceTablesOf(after),
    pinned: after.transactions.filter((row) => isPinned(row, payments)).sort(byApiOrder),
    months,
    rowsPerMonth,
    rowCount,
    attachmentCounts: Object.fromEntries(
      Object.entries(held.attachmentCounts).filter(([id]) => !delta.removed.includes(Number(id))),
    ),
    rows,
  }
  const fresh = wantedMonths(next, viewed).filter((month) => !rows.has(month) && !held.months.includes(month))
  for (const month of fresh) rows.set(month, byMonth.get(month) ?? [])
  const stale = held.cells === null ? [] : sortedMonths([...delta.stale].filter((month) => months.includes(month) || held.months.includes(month)))
  return { held: next, changed: { reference, rows: delta.changed }, stale }
}
