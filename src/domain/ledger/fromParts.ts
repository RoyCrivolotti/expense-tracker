import type { AttachmentCounts, CubePart, MonthRowsPart, ReferencePart } from '../data/ledgerParts'
import type { Transaction } from '../types'
import type { Ledger } from './types'

export interface LedgerParts {
  reference: ReferencePart
  /** Every rows request that was made. Their ranges are disjoint. */
  rows: readonly MonthRowsPart[]
  /** Every cube request that was made. Their ranges are disjoint. */
  cube: readonly CubePart[]
}

export interface LedgerFromParts {
  ledger: Ledger
  /**
   * Receipts per transaction id for every real row the ledger holds. The ledger itself has no receipt
   * list: `reference.attachments` is empty, and a row's receipts are read on demand.
   */
  attachmentCounts: AttachmentCounts
}

const within = (month: string, range: { from: string; to: string }): boolean => month >= range.from && month <= range.to

/**
 * Puts the parts the server hands out together into a ledger, with the shape `buildLedger` makes from a
 * whole dataset. The months held as real rows are the months with data inside the ranges that were
 * read, whatever was asked for. A cell of one of those months is dropped, because the rows are the
 * truth there (`assembleRows` would ignore it anyway).
 */
export function ledgerFromParts(parts: LedgerParts): LedgerFromParts {
  const { reference } = parts
  const hydratedMonths = reference.months.filter((month) => parts.rows.some((read) => within(month, read)))
  const held = new Set(hydratedMonths)
  const byId = new Map<number, Transaction>()
  for (const read of parts.rows) for (const row of read.transactions) byId.set(row.id, row)
  const attachmentCounts: AttachmentCounts = { ...reference.attachmentCounts }
  for (const read of parts.rows) Object.assign(attachmentCounts, read.attachmentCounts)
  return {
    ledger: {
      reference: { ...reference.reference, attachments: [] },
      pinned: reference.pinned,
      hydratedMonths,
      hydrated: [...byId.values()],
      cells: parts.cube.flatMap((read) => read.cells).filter((cell) => !held.has(cell.budgetMonth)),
    },
    attachmentCounts,
  }
}
