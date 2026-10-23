import type { LedgerPartsSource, MatchingTarget } from '../domain/data/dataSource'
import type { TransactionSummaryPart } from '../domain/data/ledgerParts'
import type { TxnFilter } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import { MAX_PAGE_LIMIT } from '../domain/data/transactionQuery'
import { frozen, START } from './pagerParts'
import { patchedRows, type RowChanges } from './pagerPatch'
import { transactionQueryString } from './transactionQueryString'
import { reason } from './reason'

export type PagerSource = Pick<LedgerPartsSource, 'readTransactionPage' | 'readTransactionSummary'>

export interface PagerState {
  /** The rows read so far, newest first, in the order the server gave them. */
  rows: readonly Transaction[]
  /** True once the last page has been read: every row the filter matches is in `rows`. */
  complete: boolean
  /** True while a page is on its way, the first one of a filter or a later one. */
  loading: boolean
  /**
   * True while the list is being read again to the depth it had (`refresh`). The rows stay as they were until all of
   * them are in, so nothing on screen moves.
   */
  refreshing: boolean
  /** The rows belong to the filter before this one and stay until the first page arrives, or fails and they go. */
  stale: boolean
  /** Why the last read failed, or null. */
  error: string | null
  /** The failed read was a refresh: the rows are the list as it was before a write, and asking again reads it again. */
  refreshFailed: boolean
  /**
   * How many rows match (counted to a cap) and what they net to. Null before the first one has been read, and when
   * the one read for another filter could not be replaced.
   */
  summary: TransactionSummaryPart | null
  /**
   * The figures may not fit the rows: they were read for the filter before this one and the new ones have not come,
   * or they were read before the rows were last read, or reading them again failed.
   */
  summaryStale: boolean
}

export interface PagerOptions {
  /** Rows asked for per page. Each page is one request, so fewer pages are fewer requests. Default 100. */
  limit?: number
  /**
   * How long a search text has to stay as it is before its rows are read, in milliseconds. A search box that sets a
   * filter per key asks for one read of the last text and not one per letter. Any other change of filter is read at
   * once. Zero reads at once. Default 0.
   */
  settleMs?: number
}

const PAGE_SIZE = 100

/** What the list was doing when a burst of typing began, to put back if the burst ends where it started. */
interface Parked {
  error: string | null
  refreshFailed: boolean
  /** Nothing was being read, so nothing is lost by not reading when the text comes back to what it was. */
  idle: boolean
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
 * them stays. **A screen calls `refresh()` after a write**, and may put what the write did to rows into the rows held first
 * (`patchRows`), which the read replaces. That reads the list again from its first page down
 * to the depth it had, in as few requests as the server allows, and swaps it in when every row is there, so the
 * reader keeps their place and the rows are what the filter matches at that moment and nothing else. A write made
 * after that read is not seen until the next `refresh()`. While no screen is attached (`attach`) a refresh is
 * only noted, and is made, from the first page, when one attaches.
 *
 * The count and net spend are read apart from the rows, when the filter changes or the screen asks (`refresh`
 * with `summary: true`, which a write calls for). The figures of the filter before stay until the new ones come,
 * flagged in `summaryStale`; a refresh that leaves them alone, or fails to read them again, keeps them and says so.
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
  private parked: Parked | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private cursor: string | undefined
  private generation = 0
  private abort = new AbortController()
  /** The filter the figures in `summary` were read for, and whether a read of them is on its way. */
  private summaryKey: string | null = null
  private summaryPending = false
  /** Screens showing the list, and whether a refresh was asked for while there were none. */
  private attached = 0
  private dirty = false

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
   * Says a screen is showing the list until the returned call is made. A write made while none is would cost a
   * read nobody sees, so `refresh` only notes it, and the first screen to attach reads the list again.
   */
  attach(): () => void {
    this.attached += 1
    if (this.dirty && this.filter && !this.waiting) {
      this.dirty = false
      void this.reload(0, true)
    }
    return () => {
      this.attached -= 1
    }
  }

  /**
   * Starts a new list when the filter selects different rows; the same rows, however spelled, change nothing.
   * A change of the search text waits for the last text of a burst (`settleMs`), with what is on screen marked
   * stale meanwhile; any other change is read at once.
   */
  setFilter(filter: TxnFilter): void {
    const key = transactionQueryString(filter)
    if (this.filter !== null && key === (this.waiting?.key ?? this.key)) return
    const copy = frozen(filter)
    // Back to what the list was read for, nothing is waited for: there is nothing to read.
    const returning = this.waiting !== null && key === this.key
    if (!returning && this.typing(copy)) return this.hold(copy, key)
    this.waiting = null
    clearTimeout(this.timer)
    if (returning) this.returnToCommitted()
    else this.start(copy, key)
  }

  /** Whether the filter differs from the one the screen last asked for in its search text, as a keystroke does. */
  private typing(filter: TxnFilter): boolean {
    const was = this.waiting?.filter ?? this.filter
    return this.settleMs > 0 && was !== null && (filter.query ?? '') !== (was.query ?? '')
  }

  /**
   * Reads the list again from its first page to the depth it has, with the rows already read on screen until all
   * of them are in. Call it after a write. The summary is read again only if `summary` is true. Settles when that
   * read has ended, with whether it worked, or at once with null when none was made: no screen shows the list, there
   * is no filter, or the list is of another filter now. That is not a failure, whatever an earlier read left in
   * `refreshFailed`.
   */
  async refresh({ summary = false }: { summary?: boolean } = {}): Promise<boolean | null> {
    if (this.waiting) {
      const returning = this.waiting.key === this.key
      this.settle()
      if (!returning) return null
    }
    if (!this.filter) return null
    if (this.attached === 0) {
      this.dirty = true
      return null
    }
    return this.reload(this.state.rows.length, summary).then(() => !this.state.refreshFailed)
  }

  /**
   * Puts what a write did to rows into the rows held, by id, so that the list shows it before the read that follows.
   * The read is what is true and replaces this (`patchedRows`). Nothing is done while the list is being typed at or is
   * of another filter, and the figures are marked, since the count and the net spend are the ones before the write.
   */
  patchRows(changes: RowChanges): void {
    const { rows, complete, stale } = this.state
    const next = this.filter && !this.waiting && !stale ? patchedRows(rows, this.filter, complete, changes) : rows
    if (next !== rows) this.set({ rows: next, summaryStale: this.state.summary !== null })
  }

  /**
   * The rows the list's filter matches, as the figures on screen count them, for a write that names them by the filter
   * (it is refused if the count or the revision has moved). Null whenever the figures may not be what the user is
   * looking at: the filter is being typed, the list or the figures are being read, or failed to be, and when more rows
   * match than a write on a filter may reach.
   */
  matching(): MatchingTarget | null {
    const { summary, summaryStale, stale, loading, refreshing, refreshFailed } = this.state
    const reading = stale || loading || refreshing || refreshFailed || summaryStale || this.summaryPending
    if (!this.filter || this.waiting || reading || !summary || summary.capped || this.summaryKey !== this.key) return null
    return { filter: this.filter, expectedCount: summary.count, expectedRevision: summary.revision }
  }

  /**
   * Reads the next page, or reads again what failed: a page, the first page of a filter, or a refresh.
   */
  loadMore(): void {
    const { loading, refreshing, complete, stale, error, refreshFailed, rows } = this.state
    if (loading || refreshing || this.waiting || !this.filter) return
    if (refreshFailed) return void this.read(rows.length, 'refresh')
    if (complete || (stale && error === null)) return
    if (this.cursor !== undefined || error !== null) void this.readPage()
  }

  /**
   * Drops what is in flight and what is waiting: an answer that comes after this changes nothing. The filter is
   * forgotten too, so that one set afterwards starts a list again, as a screen mounted twice in development does.
   */
  dispose(): void {
    this.supersede()
    clearTimeout(this.timer)
    this.waiting = null
    this.parked = null
    this.filter = null
    this.key = ''
    this.summaryPending = false
    this.dirty = false
    this.attached = 0
    this.listeners.clear()
  }

  /** A burst of typing begins or goes on: nothing is read until it stops. */
  private hold(filter: TxnFilter, key: string): void {
    const { loading, refreshing, error, refreshFailed, rows } = this.state
    if (!this.waiting) this.parked = { error, refreshFailed, idle: !loading && !refreshing && !this.summaryPending }
    this.supersede()
    clearTimeout(this.timer)
    this.waiting = { filter, key }
    this.set({ stale: rows.length > 0, loading: false, refreshing: false, error: null, refreshFailed: false })
    this.timer = setTimeout(() => this.settle(), this.settleMs)
  }

  private settle(): void {
    const waiting = this.waiting
    clearTimeout(this.timer)
    this.waiting = null
    if (!waiting) return
    if (waiting.key === this.key) this.returnToCommitted()
    else this.start(waiting.filter, waiting.key)
  }

  /** The text came back to what the list was read for: the rows are right, so they are shown again as they were. */
  private returnToCommitted(): void {
    const parked = this.parked
    this.parked = null
    if (parked?.idle) this.set({ stale: false, error: parked.error, refreshFailed: parked.refreshFailed })
    else void this.reload(this.state.rows.length, true)
  }

  /** Cancels the reads of the list so far: their answers no longer matter. */
  private supersede(): void {
    this.generation += 1
    this.abort.abort()
    this.abort = new AbortController()
  }

  /** A filter that selects other rows: its first page and its figures are read, and the old rows wait. */
  private start(filter: TxnFilter, key: string): void {
    this.supersede()
    this.parked = null
    this.filter = filter
    this.key = key
    this.cursor = undefined
    this.set({
      stale: this.state.rows.length > 0,
      complete: false,
      error: null,
      refreshFailed: false,
      refreshing: false,
      ...(this.state.summary ? { summaryStale: true } : {}),
    })
    void this.read(0, 'filter')
    void this.readSummary()
  }

  /** The same list read again, `depth` rows of it (a first page for none). */
  private reload(depth: number, summary: boolean): Promise<void> {
    const figures = summary || this.summaryPending || this.state.summary === null
    this.supersede()
    const done = this.read(depth, 'refresh')
    if (figures) void this.readSummary()
    else this.set({ summaryStale: true })
    return done
  }

  /**
   * Reads from the first page until `depth` rows are in (one page when it is zero) and puts them in place of
   * the rows held. A page is as large as the server allows, so a list ten pages deep is a few requests.
   */
  private async read(depth: number, mode: 'filter' | 'refresh'): Promise<void> {
    const { generation, filter } = this
    const { signal } = this.abort
    if (!filter) return
    const refreshing = mode === 'refresh'
    this.set({ loading: !refreshing, refreshing, error: null, refreshFailed: false, ...(refreshing ? { stale: false } : {}) })
    let rows: Transaction[] = []
    let cursor: string | undefined
    try {
      do {
        const limit = depth > 0 ? Math.min(MAX_PAGE_LIMIT, depth - rows.length) : this.limit
        const page = await this.source.readTransactionPage(filter, {
          limit,
          signal,
          ...(cursor !== undefined ? { cursor } : {}),
        })
        if (generation !== this.generation) return
        const fresh = new Set(page.items.map((row) => row.id))
        rows = [...rows.filter((row) => !fresh.has(row.id)), ...page.items]
        cursor = page.nextCursor ?? undefined
      } while (cursor !== undefined && rows.length < depth)
    } catch (error) {
      if (generation !== this.generation) return
      // The rows of another filter are no answer to this one; the rows of this one are only out of date.
      this.set({
        loading: false,
        refreshing: false,
        error: reason(error),
        ...(refreshing ? { refreshFailed: true } : { rows: [], stale: false }),
      })
      return
    }
    this.cursor = cursor
    this.set({ rows, complete: cursor === undefined, loading: false, refreshing: false, stale: false })
  }

  /** The next page of a list, or the first one again after it failed. */
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
    const { generation, filter, key } = this
    const { signal } = this.abort
    if (!filter) return
    this.summaryPending = true
    try {
      const summary = await this.source.readTransactionSummary(filter, { signal })
      if (generation !== this.generation) return
      this.summaryPending = false
      this.summaryKey = key
      this.set({ summary, summaryStale: false })
    } catch {
      if (generation !== this.generation) return
      this.summaryPending = false
      // The rows are still right and the screen counts what it holds. Figures read for this filter are kept and
      // flagged; those of another filter are no use to it and go.
      this.set({ summaryStale: true, ...(this.summaryKey === key ? {} : { summary: null }) })
    }
  }
}
