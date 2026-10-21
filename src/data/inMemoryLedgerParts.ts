import type { LedgerPartsSource } from './dataSource'
import { rowsRange, cubeRange } from '../domain/application/ledgerPartsService'
import {
  MAX_CUBE_CELLS,
  MAX_ROWS_PER_REQUEST,
  type MonthRange,
} from '../domain/data/ledgerParts'
import { PartTooLargeError } from '../domain/data/ledgerPartsErrors'
import { ledgerReferenceOf, monthCellsOf, monthRowsOf } from '../domain/ledger/partsOfDataset'
import type { ExpenseDataset } from '../domain/types'

/** A dataset held in memory and the revision it is at: it changes whenever the dataset does. */
export interface HeldDataset {
  dataset: ExpenseDataset
  revision: string
}

/**
 * Serves the ledger parts from a dataset the source already holds, the way the routes serve them from
 * the database: same shapes, same ranges accepted, same bounds refused. The pure ledger functions are
 * the specification the SQL is held to, so a source built on them is the reference for what a client
 * should receive. `current` is read on every call, so a part reflects the dataset as it is then.
 */
export function inMemoryLedgerParts(current: () => HeldDataset | Promise<HeldDataset>): LedgerPartsSource {
  return {
    async readReferencePart() {
      const { dataset, revision } = await current()
      return { revision, ...ledgerReferenceOf(dataset) }
    },
    async readMonthsPart(range: MonthRange) {
      const { dataset, revision } = await current()
      const asked = rowsRange(range)
      const read = monthRowsOf(dataset, asked, MAX_ROWS_PER_REQUEST)
      if (read === null) throw new PartTooLargeError(`The range holds more than ${MAX_ROWS_PER_REQUEST} rows`)
      return { revision, ...asked, ...read }
    },
    async readCubePart(range: MonthRange) {
      const { dataset, revision } = await current()
      const asked = cubeRange(range)
      const cells = monthCellsOf(dataset, asked, MAX_CUBE_CELLS)
      if (cells === null) throw new PartTooLargeError(`The range holds more than ${MAX_CUBE_CELLS} cells`)
      return { revision, ...asked, cells }
    },
  }
}
