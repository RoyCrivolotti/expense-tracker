import type { LedgerPartsSource } from './dataSource'
import type { AttachmentCounts, CubePart, MonthRange, MonthRowsPart, ReferencePart } from '../domain/data/ledgerParts'
import { LedgerChangedError, PartTooLargeError } from '../domain/data/ledgerPartsErrors'
import {
  DEFAULT_HYDRATION_POLICY,
  type HydrationPolicy,
  type Ledger,
  hydratedMonthsFor,
  ledgerFromParts,
} from '../domain/ledger'
import { planCubeRanges, planRowRanges, splitRange } from '../domain/ledger/partsPlan'

export interface LoadedLedger {
  ledger: Ledger
  /** The revision every part was read under. */
  revision: string
  /** Receipts per transaction id for the rows the ledger holds as real rows. */
  attachmentCounts: AttachmentCounts
  /** Every transaction the owner has: what the size policy was applied to. */
  rowCount: number
}

export interface LoadLedgerOptions {
  /** The month the screen opens on. Defaults to the newest month with data, where the picker opens. */
  viewed?: string
  policy?: HydrationPolicy
  /** How many times the ledger may move under the reads before the load gives up. */
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 3

interface Read {
  rows: MonthRowsPart[]
  cube: CubePart[]
}

/** Parts already read, by the range they answer, kept while the revision they carry is still current. */
interface Held {
  rows: Map<string, MonthRowsPart>
  cube: Map<string, CubePart[]>
}

const keyOf = (range: MonthRange): string => `${range.from}..${range.to}`

/** A cube request the server refuses for its size is asked for again in halves, down to one month. */
async function readCubeRange(source: LedgerPartsSource, range: MonthRange): Promise<CubePart[]> {
  try {
    return [await source.readCubePart(range)]
  } catch (error) {
    const halves = error instanceof PartTooLargeError ? splitRange(range) : null
    if (!halves) throw error
    return (await Promise.all(halves.map((half) => readCubeRange(source, half)))).flat()
  }
}

async function readPlanned(
  source: LedgerPartsSource,
  reference: ReferencePart,
  viewed: string,
  policy: HydrationPolicy,
  held: Held,
): Promise<Read> {
  const hydrated = hydratedMonthsFor(reference.months, reference.rowCount, viewed, policy)
  const everyMonth = hydrated.length === reference.months.length
  const current = (part: { revision: string }): boolean => part.revision === reference.revision
  const rows = planRowRanges(hydrated, reference.rowsPerMonth).map(async (range) => {
    const kept = held.rows.get(keyOf(range))
    if (kept && current(kept)) return kept
    const fresh = await source.readMonthsPart(range)
    held.rows.set(keyOf(range), fresh)
    return fresh
  })
  const cube = (everyMonth ? [] : planCubeRanges(reference.months)).map(async (range) => {
    const kept = held.cube.get(keyOf(range))
    if (kept?.every(current)) return kept
    const fresh = await readCubeRange(source, range)
    held.cube.set(keyOf(range), fresh)
    return fresh
  })
  return { rows: await Promise.all(rows), cube: (await Promise.all(cube)).flat() }
}

/**
 * Reads the ledger a screen showing `options.viewed` needs: the reference, the real rows of the months
 * the size policy hydrates, and the per-month sums of the rest, and puts them together.
 *
 * Every part names the revision it was read under. The reference is read first and the rest after it,
 * so a part with another revision was read later and the reference is the stale one: it is read again,
 * and the parts that already carry its revision are kept. After `maxAttempts` the load throws
 * {@link LedgerChangedError}, so a ledger written to every few milliseconds never produces a mix of
 * two states.
 */
export async function loadLedger(source: LedgerPartsSource, options: LoadLedgerOptions = {}): Promise<LoadedLedger> {
  const policy = options.policy ?? DEFAULT_HYDRATION_POLICY
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const held: Held = { rows: new Map(), cube: new Map() }
  let reference = await source.readReferencePart()
  for (let attempt = 1; ; attempt++) {
    const viewed = options.viewed ?? reference.months[reference.months.length - 1] ?? ''
    const read = await readPlanned(source, reference, viewed, policy, held)
    if ([...read.rows, ...read.cube].every((part) => part.revision === reference.revision)) {
      const { ledger, attachmentCounts } = ledgerFromParts({ reference, ...read })
      return { ledger, revision: reference.revision, attachmentCounts, rowCount: reference.rowCount }
    }
    if (attempt >= maxAttempts) throw new LedgerChangedError(`The ledger changed ${attempt} times while it was being read`)
    reference = await source.readReferencePart()
  }
}
