/**
 * What the browser holds of a ledger while it is open, as plain values with functions over them: the
 * reference, the pinned rows, the real rows of the months being looked at, and the per-month sums of
 * the rest. A change makes a new value, so a screen can compare two and the tests need no clock.
 */
import type {
  AttachmentCounts,
  CubePart,
  MonthRowsPart,
  ReferencePart,
  ReferenceTables,
} from '../domain/data/ledgerParts'
import { sortedMonths } from '../domain/engine/dates'
import {
  HYDRATED_DATA_MONTHS,
  type HydrationPolicy,
  type Ledger,
  type LedgerParts,
  type MonthCell,
  chooseHydratedMonths,
} from '../domain/ledger'
import type { Transaction, TransactionAttachment } from '../domain/types'

export interface HeldLedger {
  /** The revision the parts were read under, or null after a local write, which the server answered with another. */
  revision: string | null
  reference: ReferenceTables
  /** Rows that stay real in any month, in the order the API returns rows. */
  pinned: Transaction[]
  /** Every budget month with a row, oldest first. */
  months: string[]
  rowsPerMonth: Record<string, number>
  rowCount: number
  attachmentCounts: AttachmentCounts
  /**
   * The sums of the unpinned rows of every month, held or not (a held month's are kept so that it can be
   * given up again). Null when every month is held as rows, as for a ledger under the size policy.
   */
  cells: MonthCell[] | null
  /** The months held as real rows, with their rows, least recently used first. */
  rows: ReadonlyMap<string, readonly Transaction[]>
  /**
   * The receipts of the transactions whose list has been read, which is every one a screen asked for: the
   * parts only say how many each has (`attachmentCounts`). A transaction with none read has no entry.
   */
  receipts: ReadonlyMap<number, readonly TransactionAttachment[]>
}

function mergeCounts(...lists: readonly AttachmentCounts[]): AttachmentCounts {
  const merged: AttachmentCounts = {}
  for (const list of lists) for (const [id, n] of Object.entries(list)) merged[Number(id)] = n
  return merged
}

const within = (month: string, range: { from: string; to: string }): boolean => month >= range.from && month <= range.to

function groupByMonth(parts: readonly MonthRowsPart[], months: readonly string[]): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>()
  for (const part of parts) {
    for (const month of months) if (within(month, part)) grouped.set(month, [])
    for (const row of part.transactions) grouped.get(row.budgetMonth)?.push(row)
  }
  return grouped
}

export function holdParts(parts: LedgerParts): HeldLedger {
  const { reference } = parts
  return {
    revision: reference.revision,
    reference: reference.reference,
    pinned: reference.pinned,
    months: reference.months,
    rowsPerMonth: reference.rowsPerMonth,
    rowCount: reference.rowCount,
    attachmentCounts: mergeCounts(reference.attachmentCounts, ...parts.rows.map((read) => read.attachmentCounts)),
    cells: parts.cube.length === 0 ? null : parts.cube.flatMap((read) => read.cells),
    rows: groupByMonth(parts.rows, reference.months),
    receipts: new Map(),
  }
}

/** The ledger the model is built from. Cells of a month held as rows are left out: its rows are the truth. */
export function ledgerOfHeld(held: HeldLedger): Ledger {
  const hydratedMonths = sortedMonths(held.rows.keys())
  const hydrated = hydratedMonths.flatMap((month) => held.rows.get(month) ?? [])
  const covered = new Set(hydratedMonths)
  return {
    reference: { ...held.reference, attachments: [...held.receipts.values()].flat() },
    pinned: held.pinned,
    hydratedMonths,
    hydrated,
    cells: (held.cells ?? []).filter((cell) => !covered.has(cell.budgetMonth)),
  }
}

/**
 * The months to hold as rows for a screen showing `viewed`: the window around it, and the newest window,
 * which what reads the recent past (recent activity, the cash reserve, the pace) does not move away from.
 */
function windows(months: readonly string[], viewed: string, count: number): string[] {
  const newest = months[months.length - 1] ?? viewed
  return sortedMonths([
    ...chooseHydratedMonths(months, viewed, count),
    ...chooseHydratedMonths(months, newest, count),
  ])
}

/** Every month for a ledger held in full, otherwise the windows. */
export function wantedMonths(held: HeldLedger, viewed: string, count: number = HYDRATED_DATA_MONTHS): string[] {
  return held.cells === null ? held.months : windows(held.months, viewed, count)
}

/** The months to read as rows for a reference: every month while the ledger is small, otherwise the windows. */
export function monthsToHold(reference: ReferencePart, viewed: string, policy: HydrationPolicy): string[] {
  return reference.rowCount <= policy.fullBelowRows ? reference.months : windows(reference.months, viewed, policy.dataMonths)
}

export function missingMonths(held: HeldLedger, wanted: readonly string[]): string[] {
  return wanted.filter((month) => !held.rows.has(month))
}

/** Holds the rows of every month with data inside the ranges of `parts`. */
export function holdRows(held: HeldLedger, parts: readonly MonthRowsPart[]): HeldLedger {
  const rows = new Map(held.rows)
  for (const [month, list] of groupByMonth(parts, held.months)) {
    rows.delete(month)
    rows.set(month, list)
  }
  return { ...held, rows, attachmentCounts: mergeCounts(held.attachmentCounts, ...parts.map((part) => part.attachmentCounts)) }
}

/** Marks months as used just now, so that they are the last to be given up. */
export function touchMonths(held: HeldLedger, months: readonly string[]): HeldLedger {
  const rows = new Map(held.rows)
  for (const month of months) {
    const list = rows.get(month)
    if (list === undefined) continue
    rows.delete(month)
    rows.set(month, list)
  }
  return { ...held, rows }
}

/**
 * Gives up the least recently used months until at most `cap` are held, never one in `keep`. A ledger held in
 * full gives up nothing: it has no sums to fall back on.
 */
export function evictMonths(held: HeldLedger, keep: Iterable<string>, cap: number): HeldLedger {
  if (held.cells === null || held.rows.size <= cap) return held
  const protectedMonths = new Set(keep)
  const rows = new Map(held.rows)
  for (const month of held.rows.keys()) {
    if (rows.size <= cap) break
    if (!protectedMonths.has(month)) rows.delete(month)
  }
  return { ...held, rows }
}

/** Replaces the sums of the months the parts cover and keeps the rest. */
export function holdCells(held: HeldLedger, parts: readonly CubePart[]): HeldLedger {
  const kept = (held.cells ?? []).filter((cell) => !parts.some((part) => within(cell.budgetMonth, part)))
  const fresh = parts.flatMap((part) => part.cells)
  const cells = [...kept, ...fresh].sort((a, b) => (a.budgetMonth < b.budgetMonth ? -1 : a.budgetMonth > b.budgetMonth ? 1 : 0))
  return { ...held, cells }
}

/** What a reference part replaces: the tables, the index of months and counts, and the receipt counts. */
export function holdReference(held: HeldLedger, part: ReferencePart): HeldLedger {
  return {
    ...held,
    reference: part.reference,
    pinned: part.pinned,
    months: part.months,
    rowsPerMonth: part.rowsPerMonth,
    rowCount: part.rowCount,
    attachmentCounts: mergeCounts(held.attachmentCounts, part.attachmentCounts),
  }
}

/** Holds the receipts read for one transaction, and the count the parts gave it moves to match. */
export function holdReceipts(held: HeldLedger, transactionId: number, list: readonly TransactionAttachment[]): HeldLedger {
  const receipts = new Map(held.receipts)
  receipts.set(transactionId, list)
  const counts = { ...held.attachmentCounts }
  if (list.length > 0) counts[transactionId] = list.length
  else delete counts[transactionId]
  return { ...held, receipts, attachmentCounts: counts }
}

/** Holds a list for each id, keeping the one already held unless `again`. */
export function holdReceiptLists(
  held: HeldLedger,
  ids: readonly number[],
  lists: ReadonlyArray<readonly TransactionAttachment[]>,
  again: boolean,
): HeldLedger {
  let next = held
  for (const [i, id] of ids.entries()) if (again || !next.receipts.has(id)) next = holdReceipts(next, id, lists[i] ?? [])
  return next
}

/** The transactions among `ids` that have receipts whose list has not been read. */
export function receiptsToRead(held: HeldLedger, ids: readonly number[]): number[] {
  return ids.filter((id) => (held.attachmentCounts[id] ?? 0) > 0 && !held.receipts.has(id))
}

/** How many transactions have receipts that no screen has asked for yet. */
export function receiptsPending(held: HeldLedger): number {
  return receiptsToRead(held, Object.keys(held.attachmentCounts).map(Number)).length
}
