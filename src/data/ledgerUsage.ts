import type { UsagePart } from '../domain/data/ledgerParts'
import { usageFromDataset } from '../domain/engine/recordUsage'
import type { LedgerPartsSource } from './dataSource'
import type { WriteEvent } from './ledgerSession'
import { reason } from './reason'

export interface UsageState {
  /** The counts as last read, or null before the first read has come. */
  usage: UsagePart | null
  /** True while they are being read. */
  loading: boolean
  /** The counts were read before a write that could change them. */
  stale: boolean
  /** Why the last read failed, or null. The counts in `usage` are then the ones before it. */
  error: string | null
}

/** Reads of the counts made for one change of what is shown: the last is the one kept if writes keep coming. */
const READ_ATTEMPTS = 3

/** The fields of a row the counts are made of. */
const COUNTED_FIELDS = ['categoryId', 'accountId', 'flagId', 'labelIds']

/**
 * Whether a write could change a count. A write to rows that are held changes the counts of those rows, which the
 * datasets before and after show, and a write that reached rows that are not held did so in the fields it wrote: an
 * edit of the fields the counts are made of, or of none (labels are added with no field), or rows added or removed.
 */
export function touchesUsage({ before, after, beyond, reach }: WriteEvent): boolean {
  if (JSON.stringify(usageFromDataset(before)) !== JSON.stringify(usageFromDataset(after))) return true
  const patch = reach?.patch
  return beyond && (patch === undefined || Object.keys(patch).length === 0 || COUNTED_FIELDS.some((field) => field in patch))
}

/**
 * How many records name each category, account, flag and label, read from the server because a ledger that holds
 * only some of the rows cannot count them. They are read when a screen that shows them is on (`watch`) and are not
 * current: never read, written to since by something that could change them (`noteWrite`), or the last read failed.
 * They are read again while a screen is on after such a write, so that what is shown follows what the user did, and
 * the browser's cache answers a read of an unchanged ledger for two rows. A read that a write overtook is read again,
 * up to {@link READ_ATTEMPTS} times, and flagged as stale after that. The counts of the last read stay on view
 * when a read fails, with the reason beside them, and are never replaced by zeros.
 */
export class LedgerUsage {
  private state: UsageState = { usage: null, loading: false, stale: false, error: null }
  private readonly listeners = new Set<() => void>()
  private watching = 0
  private writes = 0
  private reading = false
  private readonly source: Pick<LedgerPartsSource, 'readUsagePart'>

  constructor(source: Pick<LedgerPartsSource, 'readUsagePart'>) {
    this.source = source
  }

  getState = (): UsageState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: Partial<UsageState>): void {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  /** A screen that shows the counts is on until the returned call is made. */
  watch = (): (() => void) => {
    this.watching += 1
    if (this.state.usage === null || this.state.stale || this.state.error !== null) void this.read()
    return () => {
      this.watching -= 1
    }
  }

  /** A write that could change a count: what was read no longer fits, and is read again while a screen shows it. */
  noteWrite(touches: boolean): void {
    if (!touches) return
    this.writes += 1
    if (this.state.usage) this.set({ stale: true })
    if (this.watching > 0) void this.read()
  }

  /** Reads them again whatever their state, as the user asking for it does. */
  refresh = (): void => {
    void this.read()
  }

  private async read(): Promise<void> {
    if (this.reading) return
    this.reading = true
    this.set({ loading: true })
    try {
      for (let tries = 1; ; tries += 1) {
        const writes = this.writes
        const usage = await this.source.readUsagePart()
        const current = writes === this.writes
        this.set({ usage, error: null, stale: !current })
        if (current || tries >= READ_ATTEMPTS) break
      }
    } catch (error) {
      this.set({ error: reason(error) })
    } finally {
      this.reading = false
      this.set({ loading: false })
    }
  }
}
