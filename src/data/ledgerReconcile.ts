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
import type { ExpenseDataset, Transaction, TransactionAttachment } from '../domain/types'
import { type HeldLedger, ledgerOfHeld, wantedMonths } from './ledgerHold'

export interface Reconciled {
  held: HeldLedger
  changed: { reference: boolean; rows: boolean; receipts: boolean }
  /** Months whose sums no longer match the rows. Empty for a ledger held in full. */
  stale: string[]
  /** Transactions that gained a receipt before their list was read, so the list held is partial. */
  partialReceipts: number[]
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

const idsOf = (list: readonly TransactionAttachment[]): string => list.map((a) => a.id).join(',')

function receiptsOf(list: readonly TransactionAttachment[], id: number): TransactionAttachment[] {
  return list.filter((a) => a.transactionId === id)
}

/**
 * The receipt lists and counts after a patch. A transaction whose receipts changed takes the list the
 * dataset now has, and its count follows; one that is gone loses both. A list that gained a receipt before the
 * transaction's list was read is partial, so it is returned for a read of the whole list.
 */
function patchReceipts(held: HeldLedger, before: ExpenseDataset, after: ExpenseDataset, removed: readonly number[]) {
  const receipts = new Map(held.receipts)
  const counts = { ...held.attachmentCounts }
  const partial: number[] = []
  const ids = new Set([...before.attachments, ...after.attachments].map((a) => a.transactionId))
  for (const id of ids) {
    const list = receiptsOf(after.attachments, id)
    if (idsOf(list) === idsOf(receiptsOf(before.attachments, id))) continue
    if (!held.receipts.has(id)) partial.push(id)
    receipts.set(id, list)
    if (list.length > 0) counts[id] = list.length
    else delete counts[id]
  }
  for (const id of removed) {
    receipts.delete(id)
    delete counts[id]
  }
  return { receipts, counts, partial: partial.filter((id) => !removed.includes(id)) }
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
  const receiptsChanged = idsOf(before.attachments) !== idsOf(after.attachments)
  if (!reference && !delta.changed && !receiptsChanged) {
    return { held, changed: { reference: false, rows: false, receipts: false }, stale: [], partialReceipts: [] }
  }
  const payments = settlementPaymentIds(after.transactions)
  const byMonth = new Map<string, Transaction[]>()
  for (const row of after.transactions) byMonth.set(row.budgetMonth, [...(byMonth.get(row.budgetMonth) ?? []), row])
  const { rowsPerMonth, rowCount, months } = recount(held, delta.counts)
  const receipts = patchReceipts(held, before, after, delta.removed)
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
    attachmentCounts: receipts.counts,
    receipts: receipts.receipts,
    rows,
  }
  const fresh = wantedMonths(next, viewed).filter((month) => !rows.has(month) && !held.months.includes(month))
  for (const month of fresh) rows.set(month, byMonth.get(month) ?? [])
  const stale = held.cells === null ? [] : sortedMonths([...delta.stale].filter((month) => months.includes(month) || held.months.includes(month)))
  const changed = { reference, rows: delta.changed, receipts: receiptsChanged }
  return { held: next, changed, stale, partialReceipts: receipts.partial }
}
