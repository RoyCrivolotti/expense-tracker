import type { LedgerPartsSource } from './dataSource'
import { shiftBudgetMonth } from '../domain/engine/dates'
import type { MonthRange } from '../domain/data/ledgerParts'
import { DEFAULT_HYDRATION_POLICY, type HydrationPolicy } from '../domain/ledger'
import { planRowRanges } from '../domain/ledger/partsPlan'
import type { ExpenseDataset } from '../domain/types'
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
import { cascadeOf } from './ledgerCascade'
import { type Reconciled, datasetOfHeld, reconcileHeld } from './ledgerReconcile'
import { type Epochs, NO_EPOCHS, type Resource, bump, mergeRead, stillCurrent } from './ledgerResources'

export interface SessionState {
  held: HeldLedger | null
  /** The month the screens are showing. */
  viewed: string
  /** True while rows of other months are being read for the month shown. */
  hydrating: boolean
  /** Why the last read in the background failed, or null. */
  error: string | null
  /** True while what is held is a snapshot: nothing is read, nothing is written, and a refresh may end it. */
  offline: boolean
}

export interface SessionOptions {
  policy?: HydrationPolicy
  /** Months held as rows at most; months the screens want are never given up. */
  maxHeldMonths?: number
}

const DEFAULT_MAX_HELD_MONTHS = 48
/** Receipt lists asked for at once: one request each, and a screen may ask for hundreds. */
const RECEIPT_REQUESTS_AT_ONCE = 6
const REFRESH_ATTEMPTS = 3

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

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * A ledger held open: the months the screens want are read when the month shown changes, a write is
 * patched into what is held at once, and a read that a write overtook is dropped for the resource it
 * overtook (`ledgerResources.ts`). `subscribe` and `getState` are what a screen reads it through.
 */
export class LedgerSession {
  private state: SessionState = { held: null, viewed: '', hydrating: false, error: null, offline: false }
  private epochs: Epochs = NO_EPOCHS
  private readonly stale = new Set<string>()
  private flushing = false
  private readonly readingReceipts = new Set<number>()
  private readonly listeners = new Set<() => void>()
  private readonly source: LedgerPartsSource
  private readonly policy: HydrationPolicy
  private readonly cap: number

  constructor(source: LedgerPartsSource, options: SessionOptions = {}) {
    this.source = source
    this.policy = options.policy ?? DEFAULT_HYDRATION_POLICY
    this.cap = options.maxHeldMonths ?? DEFAULT_MAX_HELD_MONTHS
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
    this.set({ held, viewed: viewed ?? held.months[held.months.length - 1] ?? '', error: null, offline: false })
  }

  /**
   * Holds a snapshot instead of reading: the screens show what was kept, the months not held stay as sums, and
   * a write is refused. `refresh` leaves this state once it reads.
   */
  restore(held: HeldLedger, viewed: string): void {
    this.set({ held, viewed, error: null, offline: true })
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
   * {@link REFRESH_ATTEMPTS} times.
   */
  async refresh(): Promise<void> {
    for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
      const started = this.epochs
      const parts = await readLedgerParts(this.source, this.readOptions(this.state.viewed || undefined))
      const read = holdParts(parts)
      const current = stillCurrent(started, this.epochs)
      const held = this.state.held ? mergeRead(this.state.held, read, current) : read
      if (current.cube) this.stale.clear()
      this.set({ held, error: null, offline: false })
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
    this.set({ hydrating: true })
    try {
      // After a write the revision the parts were read under is not known, so what is read now could not be
      // told from a later state of the ledger: read it all again, which also settles the revision.
      if (held.revision === null) await this.refresh()
      else await this.hydrate(missing)
    } catch (error) {
      this.set({ error: reason(error) })
    } finally {
      this.set({ hydrating: false })
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
    if (parts.some((part) => part.revision !== now.revision)) return this.refresh()
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
   * more than the patch shows (`cascadeOf`) is followed by a read of the whole ledger.
   */
  patch(patch: (dataset: ExpenseDataset) => ExpenseDataset): void {
    const held = this.state.held
    if (!held || this.state.offline) return
    const before = datasetOfHeld(held)
    const after = patch(before)
    const done = reconcileHeld(held, before, after, this.state.viewed)
    if (!done.changed.rows && !done.changed.reference && !done.changed.receipts) return
    this.epochs = bump(this.epochs, resourcesTouched(done))
    for (const month of done.stale) this.stale.add(month)
    this.set({ held: done.held })
    if (done.partialReceipts.length > 0) void this.readReceipts(done.partialReceipts, true)
    if (cascadeOf(before, after)) this.refresh().catch((error: unknown) => this.set({ error: reason(error) }))
    else if (done.stale.length > 0) void this.flushCube()
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
      for (let at = 0; at < wanted.length; at += RECEIPT_REQUESTS_AT_ONCE) {
        const chunk = wanted.slice(at, at + RECEIPT_REQUESTS_AT_ONCE)
        const lists = await Promise.all(chunk.map((id) => this.source.readReceiptsPart(id)))
        const now = this.state.held
        if (!now) return
        this.set({ held: holdReceiptLists(now, chunk, lists, again) })
      }
    } catch (error) {
      this.set({ error: reason(error) })
    } finally {
      for (const id of wanted) this.readingReceipts.delete(id)
    }
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
