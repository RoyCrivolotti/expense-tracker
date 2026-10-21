/**
 * A test double for reading a ledger in parts: a dataset served as the routes serve it, so the result
 * can be compared with `ledgerFor` over the same dataset, with a revision a test can move between two
 * reads and a record of every call.
 */
import type { LedgerPartsSource } from '../data/dataSource'
import { inMemoryLedgerParts } from '../data/inMemoryLedgerParts'
import type { ExpenseDataset, Transaction } from '../domain/types'

export interface TestSource extends LedgerPartsSource {
  /** What is served. A test replaces it to add a row under a read. */
  dataset: ExpenseDataset
  /** Every call made, in order: `reference`, `months:<from>..<to>`, `cube:<from>..<to>` or `receipts:<id>`. */
  calls: string[]
  /** The revision parts are served under. */
  revision: string
  /** Runs ahead of each call, with the call's name, so a test can change the ledger under a read. */
  before?: (call: string) => void
  /** Changes the revision, as a write between two reads would. */
  move: (revision?: string) => void
}

export function memorySource(dataset: ExpenseDataset): TestSource {
  const served = inMemoryLedgerParts(() => ({ dataset: source.dataset, revision: source.revision }))
  let step = 0
  const note = (call: string): void => {
    source.calls.push(call)
    source.before?.(call)
  }
  const source: TestSource = {
    dataset,
    calls: [],
    revision: 'r0',
    move(revision) {
      step += 1
      source.revision = revision ?? `r${step}`
    },
    readReferencePart() {
      note('reference')
      return served.readReferencePart()
    },
    readMonthsPart(range) {
      note(`months:${range.from}..${range.to}`)
      return served.readMonthsPart(range)
    },
    readCubePart(range) {
      note(`cube:${range.from}..${range.to}`)
      return served.readCubePart(range)
    },
    readReceiptsPart(transactionId) {
      note(`receipts:${transactionId}`)
      return served.readReceiptsPart(transactionId)
    },
  }
  return source
}

/** A row as the parts carry it: label ids ascending and always present. */
export function comparable(rows: readonly Transaction[]): Transaction[] {
  return rows.map((row) => ({ ...row, labelIds: [...(row.labelIds ?? [])].sort((a, b) => a - b) }))
}
