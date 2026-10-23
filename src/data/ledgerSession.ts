import type { LedgerPartsSource } from './dataSource'
import { shiftBudgetMonth } from '../domain/engine/dates'
import type { RecurringSeries } from '../domain/engine/recurringSeries'
import type { MonthRange } from '../domain/data/ledgerParts'
import { DEFAULT_HYDRATION_POLICY, type HydrationPolicy } from '../domain/ledger'
import { planRowRanges } from '../domain/ledger/partsPlan'
import type { ExpenseDataset, TransactionAttachment } from '../domain/types'
import {
  type HeldLedger,
  evictMonths,
  holdCells,
  holdParts,
  holdReceiptLists,
  holdRows,
  missingMonths,
  monthsToHold,
  receiptsToRead,
  touchMonths,
  wantedMonths,
} from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import { type Cascade, cascadeOf } from './ledgerCascade'
import { type Reconciled, datasetOfHeld, reconcileHeld } from './ledgerReconcile'
import { reshapesSeries, touchesSeries } from './touchesSeries'
import { type Epochs, NO_EPOCHS, type Resource, bump, mergeRead, stillCurrent } from './ledgerResources'
import { reason } from './reason'

export interface SessionState {
  held: HeldLedger | null
  /** The month the screens are showing. */
  viewed: string
  /** True while rows of other months are being read for the month shown, by any view: views overlap. */
  hydrating: boolean
  /** Why the last read in the background failed, or null. */
  error: string | null
  /** True while what is held is a snapshot: nothing is read, nothing is written, and a refresh may end it. */
  offline: boolean
  /** True once a read found a ledger held as a window and `refuseWindow` kept it out; nothing more is read. */
  outsized: boolean
  /**
   * The recurring series of the whole history, for a ledger held as a window while a screen that reads them is
   * mounted (`watchSeries`). Null until the first read lands, and for a ledger held in full, whose rows are the series.
   */
  series: RecurringSeries[] | null
  /** True when reading the series failed and none is held, so what depends on them is worked out from the loaded months. */
  seriesFailed: boolean
}

/** A write the session was told of, as the screens expressed it: what the rows and reference were before and after. */
export interface WriteEvent {
  before: ExpenseDataset
  after: ExpenseDataset
  /** True when it reached rows that are not held, which `before` and `after` cannot show. */
  beyond: boolean
  reach: WriteReach | undefined
}

export interface SessionOptions {
  /** Told of every write that changed something, for what depends on it and is read apart from the session. */
  onWrite?: ((write: WriteEvent) => void) | undefined
  policy?: HydrationPolicy
  /** Months held as rows at most; months the screens want are never given up. */
  maxHeldMonths?: number
  /**
   * For screens that list every row: a read, a refresh or a snapshot that holds only a window is not taken
   * in, whatever it grew to since the last one, and the session says `outsized` instead.
   */
  refuseWindow?: boolean
}

const DEFAULT_MAX_HELD_MONTHS = 48
/** Receipt lists asked for at once: one request each, and a screen may ask for hundreds. */
const RECEIPT_REQUESTS_AT_ONCE = 6
const REFRESH_ATTEMPTS = 3
/** After a read of the series failed, how long a screen mounting does not start another. */
const SERIES_BACKOFF_MS = 60_000
const SERIES_UNMATCHED = 'The recurring charges could not be matched to the rest of the ledger. Refresh to try again.'

/**
 * What a write did, for the rows of it that may not be held: a page of the list, or the rows a filter matches,
 * can reach months nobody here has read as rows, and the patch that shows the write can only change those that are held.
 */
export interface WriteReach {
  /** The rows the write named; absent when it named them in another way, or when the server did not answer with them. */
  ids?: readonly number[]
  /** The fields it wrote, if it edited; absent when it added or removed rows, which could be any series' rows. */
  patch?: object
}

/** Whether every row the write named is held as a row, so that the patch showed all of it. */
function holdsEvery(held: HeldLedger, ids: readonly number[] | undefined): boolean {
  if (ids === undefined) return false
  if (held.cells === null) return true
  const rows = new Set(held.pinned.map((row) => row.id))
  for (const list of held.rows.values()) for (const row of list) rows.add(row.id)
  return ids.every((id) => rows.has(id))
}

/**
 * Whether a write changed rows, those held and those it did not show: a cascade does (the server moved, unlinked or
 * inserted rows) and so does marking a card statement paid or unpaid (it decides whether the rows it covers are posted),
 * so a list read from the server is read again.
 */
function showsRowsChanged(done: Reconciled, cascade: Cascade | null, before: ExpenseDataset, after: ExpenseDataset): boolean {
  const statements = JSON.stringify(before.accountStatements) !== JSON.stringify(after.accountStatements)
  return done.changed.rows || cascade !== null || statements
}

/** Consecutive months as ranges, so that reading a few months again does not read the span between them. */
export function rangesOfMonths(months: readonly string[]): MonthRange[] {
  const ranges: MonthRange[] = []
  for (const month of [...months].sort()) {
    const last = ranges[ranges.length - 1]
    if (last && shiftBudgetMonth(last.to, 1) === month) last.to = month
    else if (!last || last.to !== month) ranges.push({ from: month, to: month })
  }
  return ranges
}

/** The resources a patch wrote to, whose reads that started before it are now out of date. */
function resourcesTouched(done: Reconciled): Resource[] {
  return [
    ...(done.changed.reference ? (['reference'] as const) : []),
    ...(done.changed.rows ? (['rows'] as const) : []),
    ...(done.stale.length > 0 ? (['cube'] as const) : []),
  ]
}

/**
 * A ledger held open: the months the screens want are read when the month shown changes, a write is
 * patched into what is held at once, and a read that a write overtook is dropped for the resource it
 * overtook (`ledgerResources.ts`). `subscribe` and `getState` are what a screen reads it through.
 */
export class LedgerSession {
  private state: SessionState = {
    held: null,
    viewed: '',
    hydrating: false,
    error: null,
    offline: false,
    outsized: false,
    series: null,
    seriesFailed: false,
  }
  private epochs: Epochs = NO_EPOCHS
  /** Views that are reading months right now. */
  private hydratingViews = 0
  /** The read of the ledger that the last write of a plan started. */
  private planRead: Promise<void> | null = null
  private readonly stale = new Set<string>()
  private flushing = false
  private readonly readingReceipts = new Set<number>()
  /** Screens that read the series right now, and whether a read of it is on its way. */
  private watching = 0
  private readingSeries = false
  /** The revision the held series were read under, and how many writes that touched series the session had seen. */
  private seriesRead: { revision: string; writes: number } | null = null
  private seriesWrites = 0
  /** No read of the series is started before this time, after one failed or gave up, until the user refreshes. */
  private seriesRetryAt = 0
  /** The error the series set, so that a read that works can take it away and no other. */
  private seriesMessage: string | null = null
  /** How many refreshes have started, and the newest one's outcome. */
  private refreshes = 0
  private latest: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<() => void>()
  private readonly source: LedgerPartsSource
  private readonly policy: HydrationPolicy
  private readonly cap: number
  private readonly refuseWindow: boolean
  private readonly onWrite: ((write: WriteEvent) => void) | undefined

  constructor(source: LedgerPartsSource, options: SessionOptions = {}) {
    this.source = source
    this.onWrite = options.onWrite
    this.policy = options.policy ?? DEFAULT_HYDRATION_POLICY
    this.cap = options.maxHeldMonths ?? DEFAULT_MAX_HELD_MONTHS
    this.refuseWindow = options.refuseWindow ?? false
  }

  private refuses(held: HeldLedger): boolean {
    return this.refuseWindow && held.cells !== null
  }

  getState = (): SessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: Partial<SessionState>): void {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  /** Reads the ledger for the first time, opening on `viewed` or the newest month. */
  async open(viewed?: string): Promise<void> {
    const parts = await readLedgerParts(this.source, this.readOptions(viewed ?? (this.state.viewed || undefined)))
    const held = holdParts(parts)
    if (this.refuses(held)) return this.set({ outsized: true })
    this.set({ held, viewed: viewed ?? held.months[held.months.length - 1] ?? '', error: null, offline: false })
    void this.readSeries()
  }

  /**
   * Holds a snapshot instead of reading: the screens show what was kept, the months not held stay as sums, and
   * a write is refused. `refresh` leaves this state once it reads. False for a snapshot the session refuses.
   */
  restore(held: HeldLedger, viewed: string): boolean {
    if (this.refuses(held)) return false
    this.set({ held, viewed, error: null, offline: true })
    return true
  }

  private readOptions(viewed: string | undefined) {
    return {
      policy: this.policy,
      ...(viewed ? { viewed } : {}),
      hydrate: (reference: Parameters<typeof monthsToHold>[0]) =>
        monthsToHold(reference, viewed ?? reference.months[reference.months.length - 1] ?? '', this.policy),
    }
  }

  /**
   * Reads everything again, as pull to refresh does and as a write whose effects reach rows nobody here
   * has does. A resource written to meanwhile keeps its local value and is read again, up to
   * {@link REFRESH_ATTEMPTS} times. Refreshes can overlap (a pull to refresh while the read after a cascade is
   * still going), and the one that started last read the ledger last, so an older one that answers after it
   * is dropped, and so is its failure, and it waits for the newer one's outcome instead.
   */
  refresh(): Promise<void> {
    this.seriesRetryAt = 0
    return this.refreshLedger()
  }

  private refreshLedger(): Promise<void> {
    const mine = ++this.refreshes
    this.latest = this.readAgain(mine)
    return this.latest
  }

  private async readAgain(mine: number): Promise<void> {
    for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
      const started = this.epochs
      const parts = await readLedgerParts(this.source, this.readOptions(this.state.viewed || undefined)).catch(
        (error: unknown) => {
          if (mine === this.refreshes) throw error
          return null
        },
      )
      if (mine !== this.refreshes || !parts) return this.latest
      const read = holdParts(parts)
      if (this.refuses(read)) return this.set({ outsized: true })
      const current = stillCurrent(started, this.epochs)
      const held = this.state.held ? mergeRead(this.state.held, read, current) : read
      if (current.cube) this.stale.clear()
      this.set({ held, error: null, offline: false })
      void this.readSeries()
      if (current.reference && current.rows && current.cube) return
    }
  }

  /**
   * The month the screens show changed: read the months of its window that are not held. A read that fails
   * is reported in `error` and leaves the month with the sums it has, so the call never rejects.
   */
  async view(month: string): Promise<void> {
    this.set({ viewed: month })
    const held = this.state.held
    if (!held) return
    const wanted = wantedMonths(held, month, this.policy.dataMonths)
    const missing = missingMonths(held, wanted)
    if (this.state.offline) return
    if (missing.length === 0) return this.set({ held: this.tidy(touchMonths(held, wanted)) })
    this.hydratingViews += 1
    this.set({ hydrating: true })
    try {
      // After a write the revision the parts were read under is not known, so what is read now could not be
      // told from a later state of the ledger: read it all again, which also settles the revision.
      if (held.revision === null) await this.refreshLedger()
      else await this.hydrate(missing)
    } catch (error) {
      this.set({ error: reason(error) })
    } finally {
      // Views overlap: the first read to answer must not say the month on screen has been read while another still is.
      this.hydratingViews -= 1
      this.set({ hydrating: this.hydratingViews > 0 })
    }
  }

  private async hydrate(missing: string[]): Promise<void> {
    const started = this.epochs
    const held = this.state.held
    if (!held) return
    const ranges = planRowRanges(missing, held.rowsPerMonth)
    const parts = await Promise.all(ranges.map((range) => this.source.readMonthsPart(range)))
    const now = this.state.held
    if (!now) return
    if (parts.some((part) => part.revision !== now.revision)) return this.refreshLedger()
    // A write meanwhile may have changed rows of these months, so what was read is read again.
    if (started.rows !== this.epochs.rows) return this.hydrate(missingMonths(now, missing))
    this.set({ held: this.tidy(holdRows(now, parts)) })
  }

  /** Marks the months the screens want as used and gives up the oldest others beyond the cap. */
  private tidy(held: HeldLedger): HeldLedger {
    const wanted = wantedMonths(held, this.state.viewed, this.policy.dataMonths)
    return evictMonths(touchMonths(held, wanted), wanted, this.cap)
  }

  /**
   * A write the user made, as the patch functions of the screens express it. One the server answered with
   * more than the patch shows (`cascadeOf`) is followed by a read of the whole ledger, and so is one that
   * reached rows that are not held (`reach`: the patch cannot show those, and neither the sums of their months
   * nor a series they are in). True when the write changed rows, held or not, which a list read from the
   * server does not see until it is read again.
   */
  patch(patch: (dataset: ExpenseDataset) => ExpenseDataset, reach?: WriteReach): boolean {
    const held = this.state.held
    if (!held || this.state.offline) return false
    // Asked before the patch: a row it removes is held until then.
    const beyond = reach !== undefined && !holdsEvery(held, reach.ids)
    const before = datasetOfHeld(held)
    const after = patch(before)
    const done = reconcileHeld(held, before, after, this.state.viewed)
    const changed = Object.values(done.changed).some(Boolean)
    const cascade = changed ? cascadeOf(before, after) : null
    if (changed) this.hold(done, before, after, cascade)
    if (beyond) this.readBeyond(reach)
    if (changed || beyond) this.onWrite?.({ before, after, beyond, reach })
    return beyond || showsRowsChanged(done, cascade, before, after)
  }

  private hold(done: Reconciled, before: ExpenseDataset, after: ExpenseDataset, cascade: Cascade | null): void {
    this.epochs = bump(this.epochs, resourcesTouched(done))
    for (const month of done.stale) this.stale.add(month)
    // A cascade turns rows into, or out of, series that the patch does not show.
    if (cascade !== null || touchesSeries(before.transactions, after.transactions)) this.seriesWrites += 1
    this.set({ held: done.held })
    if (done.partialReceipts.length > 0) void this.readReceipts(done.partialReceipts, true)
    if (cascade === null) {
      if (done.stale.length > 0) void this.flushCube()
      return
    }
    const read = this.refreshLedger()
    read.catch((error: unknown) => this.set({ error: reason(error) }))
    if (cascade === 'plan') this.planRead = read
  }

  /**
   * Resolves at once, or when the read of the ledger a write of a plan started has finished. That read is what makes
   * the server insert the instalments that are due, so a list read before it does not have them.
   */
  afterPlanWrite(): Promise<void> {
    return (this.planRead ?? Promise.resolve()).catch(() => undefined)
  }

  /**
   * Reads the rows and sums again, once, after a write to rows that are not held. The series are read again by
   * the refresh if a screen shows them, and only when the write could have changed them: the fields it wrote
   * (`reshapesSeries`), or rows added or removed, of which nothing is known.
   */
  private readBeyond({ patch }: WriteReach): void {
    this.epochs = bump(this.epochs, ['rows', 'cube'])
    if (patch === undefined || reshapesSeries(patch)) this.seriesWrites += 1
    this.refreshLedger().catch((error: unknown) => this.set({ error: reason(error) }))
  }

  /**
   * A screen reads the recurring series of the whole history (the fixed and flexible split, the Upcoming card),
   * which a ledger held as a window cannot work out from its rows. They are read when a screen that uses them
   * mounts and they are not current: never read, written to since by something that could change them
   * (`touchesSeries`), or read at another revision than the rows. A screen that is already mounted when such a
   * write is made reads nothing until a refresh: the server reads every row for them, about ten rows per
   * transaction, so a read per write would cost more than the writes do. The Upcoming card folds the rows written
   * since into them (`foldNewerRows`) and the rest waits for the next screen to mount or for a refresh. A refresh
   * reads them once, whether the user asked for it or a write the server answered with more than the patch
   * shows started it. A read that failed or gave up is not started again by a screen mounting for a minute, and a
   * refresh lifts that.
   * Returns the call that says the screen has gone.
   */
  watchSeries = (): (() => void) => {
    this.watching += 1
    void this.readSeries()
    return () => {
      this.watching -= 1
    }
  }

  private wantsSeries(): boolean {
    const { held, offline } = this.state
    return this.watching > 0 && held !== null && held.cells !== null && !offline && Date.now() >= this.seriesRetryAt
  }

  /** The series held were read after the last write that touched them, under the revision the rows were read under. */
  private seriesCurrent(): boolean {
    const read = this.seriesRead
    const revision = this.state.held?.revision ?? null
    return read !== null && read.writes === this.seriesWrites && (revision === null || revision === read.revision)
  }

  /** Says why the series are not what they should be, and holds off reading them again for a while. */
  private seriesFailedWith(message: string): void {
    this.seriesMessage = message
    this.seriesRetryAt = Date.now() + SERIES_BACKOFF_MS
    this.set({ error: message, seriesFailed: this.state.series === null })
  }

  private async readSeries(): Promise<void> {
    if (this.readingSeries) return
    this.readingSeries = true
    try {
      for (let tries = 1; this.wantsSeries() && !this.seriesCurrent(); tries += 1) {
        const writes = this.seriesWrites
        const part = await this.source.readSeriesPart()
        // A write that touched them while they were read is not in them: they are held as read, and stale.
        this.seriesRead = { revision: part.revision, writes }
        const cleared = this.state.error !== null && this.state.error === this.seriesMessage
        this.set({ series: part.series, seriesFailed: false, ...(cleared ? { error: null } : {}) })
        // The rows were read under another revision, so the ledger moved since: bring them level with the series.
        if ((this.state.held?.revision ?? part.revision) === part.revision) break
        if (tries >= REFRESH_ATTEMPTS) return this.seriesFailedWith(SERIES_UNMATCHED)
        await this.refreshLedger()
      }
    } catch (error) {
      this.seriesFailedWith(reason(error))
    } finally {
      this.readingSeries = false
    }
  }

  /**
   * Reads the receipts of these transactions into what is held. The parts only count them, and a screen that
   * shows them asks here. Lists already read are not read again; a failed read is kept in `error`.
   */
  loadReceipts = (ids: readonly number[]): void => {
    void this.readReceipts(ids, false)
  }

  /** `again` reads a list that is held too, for one that a write left partial. */
  private async readReceipts(ids: readonly number[], again: boolean): Promise<void> {
    const held = this.state.held
    if (!held || this.state.offline) return
    const wanted = (again ? [...ids] : receiptsToRead(held, ids)).filter((id) => !this.readingReceipts.has(id))
    for (const id of wanted) this.readingReceipts.add(id)
    try {
      if (!again && wanted.length > RECEIPT_REQUESTS_AT_ONCE) await this.readAllReceipts(wanted)
      else await this.readReceiptLists(wanted, again)
    } catch (error) {
      this.set({ error: reason(error) })
    } finally {
      for (const id of wanted) this.readingReceipts.delete(id)
    }
  }

  /** A list a request at a time, a few at once. */
  private async readReceiptLists(wanted: number[], again: boolean): Promise<void> {
    for (let at = 0; at < wanted.length; at += RECEIPT_REQUESTS_AT_ONCE) {
      const chunk = wanted.slice(at, at + RECEIPT_REQUESTS_AT_ONCE)
      const lists = await Promise.all(chunk.map((id) => this.source.readReceiptsPart(id)))
      const now = this.state.held
      if (!now) return
      this.set({ held: holdReceiptLists(now, chunk, lists, again) })
    }
  }

  /** More than a few lists are one request for every receipt, as the dataset carries them, not a request each. */
  private async readAllReceipts(wanted: number[]): Promise<void> {
    const all = await this.source.readReceiptsPart()
    const now = this.state.held
    if (!now) return
    const byTransaction = new Map<number, TransactionAttachment[]>()
    for (const receipt of all) {
      const list = byTransaction.get(receipt.transactionId)
      if (list) list.push(receipt)
      else byTransaction.set(receipt.transactionId, [receipt])
    }
    this.set({ held: holdReceiptLists(now, wanted, wanted.map((id) => byTransaction.get(id) ?? []), false) })
  }

  /** Reads again the sums of the months a write moved, until none is waiting. */
  private async flushCube(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    try {
      while (this.stale.size > 0) {
        const months = [...this.stale]
        const started = this.epochs.cube
        const parts = await Promise.all(rangesOfMonths(months).map((range) => this.source.readCubePart(range)))
        const held = this.state.held
        if (!held || held.cells === null) break
        if (this.epochs.cube !== started) continue
        for (const month of months) this.stale.delete(month)
        const revision = parts[0]?.revision ?? held.revision
        this.set({ held: { ...holdCells(held, parts), revision: held.revision ?? revision } })
      }
    } catch (error) {
      this.set({ error: reason(error) })
    } finally {
      this.flushing = false
    }
  }
}
