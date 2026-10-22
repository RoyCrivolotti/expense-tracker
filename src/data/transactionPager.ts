import type { LedgerPartsSource } from '../domain/data/dataSource'
import type { TransactionSummaryPart } from '../domain/data/ledgerParts'
import type { TxnFilter } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import { transactionQueryString } from './transactionQueryString'

export type PagerSource = Pick<LedgerPartsSource, 'readTransactionPage' | 'readTransactionSummary'>

export interface PagerState {
  /** The rows read so far, newest first, in the order the server gave them. */
  rows: readonly Transaction[]
  /** True once the last page has been read: every row the filter matches is in `rows`. */
  complete: boolean
  /** True while a page is on its way. */
  loading: boolean
  /** The rows belong to the filter before this one, or to the list before a refresh, and stay until the first page arrives. */
  stale: boolean
  /** Why the last read of a page failed, or null. */
  error: string | null
  /**
   * How many rows match (counted to a cap) and what they net to. Null never means there is none: the figures
   * are being read (a new filter), or reading them failed and `summaryStale` says so.
   */
  summary: TransactionSummaryPart | null
  /** The summary was read before the rows were last read, or its read again failed, so it may no longer fit them. */
  summaryStale: boolean
}

export interface PagerOptions {
  /** Rows asked for per page. Each page is one request, so fewer pages are fewer requests. Default 100. */
  limit?: number
  /**
   * How long a filter has to stay as it is before its rows are read, in milliseconds. A search box that sets a
   * filter per key asks for one read of the last text and not one per letter. Zero reads at once. Default 0.
   */
  settleMs?: number
}

const START: PagerState = {
  rows: [],
  complete: false,
  loading: false,
  stale: false,
  error: null,
  summary: null,
  summaryStale: false,
}
const PAGE_SIZE = 100

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** A copy of the filter the caller cannot change under a cursor that was cut from it. */
function frozen(filter: TxnFilter): TxnFilter {
  return Object.freeze({
    ...filter,
    ...(filter.labelIds ? { labelIds: Object.freeze([...filter.labelIds]) as number[] } : {}),
    ...(filter.queryAmount ? { queryAmount: Object.freeze({ ...filter.queryAmount }) } : {}),
  })
}

/**
 * The rows a filter matches, read a page at a time from the server and held for as long as the filter stays
 * the same. The server pages by position: a page is the rows strictly after the last one of the page before,
 * so a row that comes or goes meanwhile never repeats or hides one that was there throughout. The cursor is
 * the one the server gave, handed back as it came with the filter it was cut from (a copy, so the caller cannot
 * change it), and neither is rebuilt from the rows or from whatever the screen says now: a filter that changed
 * under the cursor (the month rolled over at midnight) is a new list, not a continuation.
 *
 * Paging by position has a consequence the pager does not hide. A row edited after its page was read can be
 * sent again by a later page, at its new place, and the later copy replaces the one already held. A row that
 * moves to a place behind the cursor, or arrives there, is not in the pages already read, and one deleted from
 * them stays. **A screen calls `refresh()` after a write.** That reads the list again from its first page, with
 * the rows already read on screen until it arrives, and once every page is in, the rows are what the filter
 * matches at that moment and nothing else. A write made after that read is not seen until the next `refresh()`.
 *
 * The count and net spend are read apart from the rows, when the filter changes or the screen asks (`refresh`
 * with `summary: true`, which a write calls for). A refresh that leaves them alone, or fails to read them again,
 * keeps the old figures and says so in `summaryStale`.
 */
export class TransactionPager {
  private state: PagerState = START
  private readonly listeners = new Set<() => void>()
  private readonly source: PagerSource
  private readonly limit: number
  private readonly settleMs: number
  private filter: TxnFilter | null = null
  private key = ''
  private waiting: { filter: TxnFilter; key: string } | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private cursor: string | undefined
  private generation = 0
  private abort = new AbortController()

  constructor(source: PagerSource, { limit = PAGE_SIZE, settleMs = 0 }: PagerOptions = {}) {
    this.source = source
    this.limit = limit
    this.settleMs = settleMs
  }

  getState = (): PagerState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: Partial<PagerState>): void {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  /**
   * Starts a new list when the filter selects different rows; the same rows, however spelled, change nothing.
   * With a settle time, the read waits for the last filter of a burst, and what is on screen is marked stale
   * meanwhile.
   */
  setFilter(filter: TxnFilter): void {
    const key = transactionQueryString(filter)
    if (key === (this.waiting?.key ?? this.key) && (this.waiting !== null || this.filter !== null)) return
    const copy = frozen(filter)
    if (this.settleMs <= 0) return this.start(copy, key, 'read')
    this.supersede()
    clearTimeout(this.timer)
    this.waiting = { filter: copy, key }
    this.set({ stale: this.state.rows.length > 0, loading: false, complete: false, error: null, summary: null })
    this.timer = setTimeout(() => this.settle(), this.settleMs)
  }

  /**
   * Reads the list again from its first page, with the rows already read on screen until it arrives. Call it
   * after a write. The summary is read again only if `summary` is true.
   */
  refresh({ summary = false }: { summary?: boolean } = {}): void {
    if (this.waiting) return this.settle()
    if (this.filter) this.start(this.filter, this.key, summary ? 'read' : 'keep')
  }

  /** Reads the next page, or reads again the one that failed, whether it was the first or a later one. */
  loadMore(): void {
    const { loading, complete, stale, error } = this.state
    if (loading || complete || this.waiting) return
    if (stale && error === null) return
    if (this.filter && (this.cursor !== undefined || error !== null)) void this.readPage()
  }

  /** Drops what is in flight and what is waiting: an answer that comes after this changes nothing. */
  dispose(): void {
    this.supersede()
    clearTimeout(this.timer)
    this.waiting = null
    this.listeners.clear()
  }

  private settle(): void {
    const waiting = this.waiting
    clearTimeout(this.timer)
    this.waiting = null
    if (waiting) this.start(waiting.filter, waiting.key, waiting.key === this.key ? 'keep' : 'read')
  }

  /** Cancels the reads of the list so far: their answers no longer matter. */
  private supersede(): void {
    this.generation += 1
    this.abort.abort()
    this.abort = new AbortController()
  }

  private start(filter: TxnFilter, key: string, summary: 'read' | 'keep'): void {
    const changed = key !== this.key || this.filter === null
    this.supersede()
    this.filter = filter
    this.key = key
    this.cursor = undefined
    this.set({
      stale: this.state.rows.length > 0,
      complete: false,
      error: null,
      ...(changed ? { summary: null, summaryStale: false } : {}),
    })
    void this.readPage()
    // A summary that was cancelled with the list it belonged to leaves none behind, so one is always read then.
    if (summary === 'read' || changed || this.state.summary === null) void this.readSummary()
    else this.set({ summaryStale: true })
  }

  private async readPage(): Promise<void> {
    const { generation, filter, cursor } = this
    const { signal } = this.abort
    if (!filter) return
    this.set({ loading: true, error: null })
    try {
      const page = await this.source.readTransactionPage(filter, {
        limit: this.limit,
        signal,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      if (generation !== this.generation) return
      this.cursor = page.nextCursor ?? undefined
      const fresh = new Set(page.items.map((row) => row.id))
      const held = this.state.stale ? [] : this.state.rows.filter((row) => !fresh.has(row.id))
      this.set({ rows: [...held, ...page.items], complete: page.nextCursor === null, loading: false, stale: false })
    } catch (error) {
      if (generation === this.generation) this.set({ loading: false, error: reason(error) })
    }
  }

  /** The count and net spend come apart from the rows, so a slow or failed one holds up neither. */
  private async readSummary(): Promise<void> {
    const { generation, filter } = this
    const { signal } = this.abort
    if (!filter) return
    try {
      const summary = await this.source.readTransactionSummary(filter, { signal })
      if (generation === this.generation) this.set({ summary, summaryStale: false })
    } catch {
      // The rows are still right and the screen counts what it holds. An old summary is kept and flagged.
      if (generation === this.generation) this.set({ summaryStale: true })
    }
  }
}
