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
  /** The rows belong to the filter before this one and stay until the first page of the new one arrives. */
  stale: boolean
  /** Why the last read of a page failed, or null. */
  error: string | null
  /** How many rows match (counted to a cap) and what they net to. Null until read, and for a new filter. */
  summary: TransactionSummaryPart | null
}

const START: PagerState = { rows: [], complete: false, loading: false, stale: false, error: null, summary: null }
/** Rows asked for per page. Each page is one request, so fewer pages are fewer requests. */
const PAGE_SIZE = 100

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * The rows a filter matches, read a page at a time from the server and held for as long as the filter stays
 * the same. The server pages by position: a page is the rows strictly after the last one of the page before,
 * so a row that comes or goes meanwhile never repeats or hides one that was there throughout. The cursor is
 * the one the server gave, handed back as it came with the filter it was cut from, and neither is rebuilt
 * from the rows or from whatever the screen says now: a filter that changed under the cursor (the month
 * rolled over at midnight) is a new list, not a continuation.
 *
 * A row that is edited after its page was read can be sent again by a later page, at its new place; the later
 * copy replaces the one already held. A row deleted or moved earlier in the list stays until `refresh`.
 */
export class TransactionPager {
  private state: PagerState = START
  private readonly listeners = new Set<() => void>()
  private filter: TxnFilter | null = null
  private key = ''
  private cursor: string | undefined
  private generation = 0

  private readonly source: PagerSource
  private readonly limit: number

  constructor(source: PagerSource, limit: number = PAGE_SIZE) {
    this.source = source
    this.limit = limit
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

  /** Starts a new list when the filter selects different rows; the same rows, however spelled, change nothing. */
  setFilter(filter: TxnFilter): void {
    const key = transactionQueryString(filter)
    if (key === this.key && this.filter !== null) return
    this.start(filter, key, true)
  }

  /** Reads the list again from its first page, with the rows already read on screen until it arrives. */
  refresh(): void {
    if (this.filter) this.start(this.filter, this.key, false)
  }

  /** Reads the next page, or reads again the one that failed. */
  loadMore(): void {
    if (this.state.loading || this.state.complete || this.state.stale) return
    if (this.filter && (this.cursor !== undefined || this.state.error !== null)) void this.readPage()
  }

  /** Drops what is in flight: an answer that comes after this changes nothing. */
  dispose(): void {
    this.generation += 1
    this.listeners.clear()
  }

  private start(filter: TxnFilter, key: string, changed: boolean): void {
    this.filter = filter
    this.key = key
    this.cursor = undefined
    this.generation += 1
    this.set({
      stale: this.state.rows.length > 0,
      complete: false,
      error: null,
      ...(changed ? { summary: null } : {}),
    })
    void this.readPage()
    void this.readSummary()
  }

  private async readPage(): Promise<void> {
    const { generation, filter, cursor } = this
    if (!filter) return
    this.set({ loading: true, error: null })
    try {
      const page = await this.source.readTransactionPage(filter, {
        limit: this.limit,
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
    if (!filter) return
    try {
      const summary = await this.source.readTransactionSummary(filter)
      if (generation === this.generation) this.set({ summary })
    } catch {
      // The rows are still right and the screen counts what it holds; the next refresh asks again.
    }
  }
}
