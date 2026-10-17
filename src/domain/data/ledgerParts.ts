/**
 * The parts of a ledger the server hands out separately, so that a client does not have to load every
 * transaction (docs/SCALING.md, "Ledger parts"). Three reads, each owner-scoped from the session:
 *
 * - the reference tables, the pinned rows and what the ledger holds (`LedgerReferenceRead`),
 * - every real row of a range of budget months (`MonthRowsRead`),
 * - the per-month sums of the unpinned rows of a range (`MonthCell[]`).
 *
 * The HTTP routes add the owner's revision token to each, so a client can tell that two responses were
 * read from different states of the ledger and fetch again.
 */
import type { LedgerReference, MonthCell } from '../ledger/types'
import type { Transaction } from '../types'

/**
 * Everything in a ledger's reference except receipts. A row's receipts are listed on demand
 * (`GET /api/expenses/attachments?transactionId=`), and `AttachmentCounts` says which rows have any.
 */
export type ReferenceTables = Omit<LedgerReference, 'attachments'>

/** Receipts per transaction id, for the rows that have at least one. */
export type AttachmentCounts = Record<number, number>

/** An inclusive range of budget months, `YYYY-MM`. */
export interface MonthRange {
  from: string
  to: string
}

export interface LedgerReferenceRead {
  reference: ReferenceTables
  /** `partitionPinned(...).pinned` over the whole ledger, in the order the API returns rows. */
  pinned: Transaction[]
  /** Receipts of the pinned rows. */
  attachmentCounts: AttachmentCounts
  /** Every budget month with at least one row (cancelled rows count), oldest first. */
  months: string[]
  /** Rows in each of `months`; sums to `rowCount`. */
  rowsPerMonth: Record<string, number>
  /** Every transaction the owner has, pinned or not. */
  rowCount: number
}

export interface MonthRowsRead {
  /** Real rows whose budget month is in the range, in the order the API returns rows. */
  transactions: Transaction[]
  /** Receipts of those rows. */
  attachmentCounts: AttachmentCounts
}

/** Calendar months a rows request may span. */
export const MAX_ROWS_MONTHS = 24
/**
 * Rows a rows request may return. A request for more is refused rather than trimmed, because a
 * client that silently received part of a month would compute wrong totals.
 */
export const MAX_ROWS_PER_REQUEST = 5_000
/** Calendar months a cube request may span. */
export const MAX_CUBE_MONTHS = 120
/** Cells a cube request may return. */
export const MAX_CUBE_CELLS = 10_000

/** The wire shapes: each read, with the revision it was read under. */
export interface ReferencePart extends LedgerReferenceRead {
  revision: string
}

export interface MonthRowsPart extends MonthRange, MonthRowsRead {
  revision: string
}

export interface CubePart extends MonthRange {
  revision: string
  cells: MonthCell[]
}
