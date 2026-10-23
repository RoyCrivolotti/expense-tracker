import { afterEach, describe, expect, it, vi } from 'vitest'
import { summaryOf } from '../domain/data/transactionQueryOf'
import { filterTransactions, type TxnFilter } from '../domain/engine/transactions'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { makeTransaction } from '../testing/factories'
import { memorySource, type TestSource } from '../testing/ledgerSource'
import { awkwardLedger, filterStream, vocabularyOf } from '../testing/transactionQueryKit'
import { TransactionPager, type PagerState } from './transactionPager'

/** A pager with a screen attached to it, as the Transactions tab is while it is open. */
function pagerOf(source: TestSource, options?: ConstructorParameters<typeof TransactionPager>[1]): TransactionPager {
  const pager = new TransactionPager(source, options)
  pager.attach()
  return pager
}

/** Resolves once no page is on its way. */
function settled(pager: TransactionPager): Promise<PagerState> {
  return new Promise((resolve) => {
    const check = () => {
      const { loading, refreshing } = pager.getState()
      if (loading || refreshing) return
      off()
      resolve(pager.getState())
    }
    const off = pager.subscribe(check)
    check()
  })
}

/** Reads pages the way a screen that scrolls to the end does. */
async function drain(pager: TransactionPager): Promise<PagerState> {
  for (let guard = 0; guard < 10_000; guard += 1) {
    const state = await settled(pager)
    if (state.complete || state.error !== null) return state
    pager.loadMore()
  }
  throw new Error('the pager never finished')
}

const ids = (rows: readonly Transaction[]) => rows.map((row) => row.id)
const ledger = awkwardLedger()
const idsOf = (filter: TxnFilter, from: Transaction[] = ledger.transactions) => ids(filterTransactions(from, filter))

describe('TransactionPager', () => {
  it('holds, for any filter and page size, the rows the engine lists, in its order, with the summary beside them', async () => {
    const source = memorySource(ledger)
    for (const [at, filter] of [{}, ...filterStream(vocabularyOf(ledger), 40, 21)].entries()) {
      const pager = pagerOf(source, { limit: [7, 50, 100, 200][at % 4]! })
      pager.setFilter(filter)
      const state = await drain(pager)
      expect(ids(state.rows), JSON.stringify(filter)).toEqual(idsOf(filter))
      expect(state.complete).toBe(true)
      await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
      expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, filter))
    }
  })

  it('hands back the cursor the server gave and the filter the list started with, whatever the screen says since', async () => {
    const source = memorySource(ledger)
    const seen: Array<[TxnFilter, string | undefined]> = []
    const cursors: Array<string | null> = []
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = async (filter, request) => {
      seen.push([filter, request?.cursor])
      const page = await read(filter, request)
      cursors.push(page.nextCursor)
      return page
    }
    const pager = pagerOf(source, { limit: 15 })
    const month = vocabularyOf(ledger).months[10]!
    const first: TxnFilter = { month, status: 'all' }
    pager.setFilter(first)
    await settled(pager)
    pager.setFilter({ month })
    await drain(pager)
    expect(seen.length).toBeGreaterThan(2)
    expect(seen.every(([filter]) => filter === seen[0]![0])).toBe(true)
    expect(seen[0]![0]).toEqual(first)
    expect(seen.map(([, cursor]) => cursor)).toEqual([undefined, ...cursors.slice(0, -1)])
  })

  it('starts over for a filter that selects other rows, keeping the old rows and figures, marked, until the new ones arrive', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({ status: 'posted' })
    await settled(pager)
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    const before = pager.getState()
    pager.setFilter({ status: 'forecast' })
    expect(pager.getState()).toMatchObject({ stale: true, loading: true, complete: false, summaryStale: true })
    expect(pager.getState().rows).toBe(before.rows)
    expect(pager.getState().summary).toBe(before.summary)
    pager.loadMore()
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(2)
    const state = await settled(pager)
    expect(state.stale).toBe(false)
    expect(ids(state.rows)).toEqual(idsOf({ status: 'forecast' }).slice(0, 20))
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, { status: 'forecast' }))
  })

  it('drops the answer of a page that was asked for under an earlier filter', async () => {
    const source = memorySource(ledger)
    const read = source.readTransactionPage.bind(source)
    const release: Array<() => void> = []
    source.readTransactionPage = (filter, request) =>
      new Promise((resolve) => release.push(() => resolve(read(filter, request))))
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({ status: 'posted' })
    pager.setFilter({ status: 'forecast' })
    release[1]!()
    await vi.waitFor(() => expect(pager.getState().loading).toBe(false))
    release[0]!()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(ids(pager.getState().rows)).toEqual(idsOf({ status: 'forecast' }).slice(0, 20))
  })

  it('treats a filter spelled differently but selecting the same rows as the list it already has', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20 })
    const month = vocabularyOf(ledger).months[10]!
    pager.setFilter({ month })
    await settled(pager)
    pager.setFilter({ month, status: 'all', type: 'all', labelIds: [], query: '' })
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(1)
  })
})

describe('TransactionPager, a ledger that changes while it is read', () => {
  const first = ledger.transactions.slice().sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))

  async function afterFirstPage(change: (dataset: ExpenseDataset) => ExpenseDataset, limit = 25) {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit })
    pager.setFilter({})
    await settled(pager)
    const changed = change(ledger)
    source.dataset = changed
    const state = await drain(pager)
    return { source, pager, state, changed }
  }

  it('sends a row edited to an older day again at its new place, and holds it once', async () => {
    const moved = first[3]!
    const older = first[200]!
    const { state } = await afterFirstPage((d) => ({
      ...d,
      transactions: d.transactions.map((t) => (t.id === moved.id ? { ...t, date: older.date, description: 'Edited' } : t)),
    }))
    const held = ids(state.rows)
    expect(new Set(held).size).toBe(held.length)
    expect(state.rows.find((t) => t.id === moved.id)).toMatchObject({ date: older.date, description: 'Edited' })
    const throughout = held.filter((id) => id !== moved.id)
    expect(throughout).toEqual(ids(first).filter((id) => id !== moved.id))
  })

  it('shows a row added past the cursor and not one added before it, until the list is read again', async () => {
    const before = makeTransaction({ id: 9_000_001, date: first[0]!.date, budgetMonth: first[0]!.budgetMonth, status: 'posted' })
    const past = makeTransaction({ id: 9_000_002, date: first[300]!.date, budgetMonth: first[300]!.budgetMonth, status: 'posted' })
    const { state, pager, changed } = await afterFirstPage((d) => ({ ...d, transactions: [...d.transactions, before, past] }))
    expect(ids(state.rows)).toContain(past.id)
    expect(ids(state.rows)).not.toContain(before.id)
    void pager.refresh()
    expect(pager.getState()).toMatchObject({ refreshing: true, stale: false })
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}, changed.transactions))
  })

  it('keeps a row deleted from the pages already read until the list is read again, and never hides another', async () => {
    const gone = first[5]!
    const { state, pager, changed } = await afterFirstPage((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== gone.id) }))
    expect(ids(state.rows)).toEqual(ids(first))
    void pager.refresh()
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}, changed.transactions))
  })

  it('keeps the summary through a refresh, and through a filter that selects other rows until the new one comes', async () => {
    const source = memorySource(ledger)
    const [january, february] = vocabularyOf(ledger).months
    const pager = pagerOf(source, { limit: 50 })
    pager.setFilter({ month: january! })
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    const summary = pager.getState().summary
    void pager.refresh()
    expect(pager.getState().summary).toBe(summary)
    pager.setFilter({ month: february! })
    expect(pager.getState()).toMatchObject({ summary, summaryStale: true })
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, { month: february! }))
  })
})

describe('TransactionPager, reads that fail', () => {
  function failing(source: TestSource, shape: (call: number, cursor: string | undefined) => 'fail' | 'bad-cursor' | 'ok') {
    const read = source.readTransactionPage.bind(source)
    let call = 0
    source.readTransactionPage = async (filter, request) => {
      const what = shape(call++, request?.cursor)
      if (what === 'fail') throw new Error('offline')
      const page = await read(filter, request)
      return what === 'bad-cursor' && page.nextCursor ? { ...page, nextCursor: `${page.nextCursor}x` } : page
    }
  }

  it('keeps the rows read, says why, and reads the same page again when asked', async () => {
    const source = memorySource(ledger)
    const cursors: Array<string | undefined> = []
    failing(source, (call, cursor) => {
      cursors.push(cursor)
      return call === 1 ? 'fail' : 'ok'
    })
    const pager = pagerOf(source, { limit: 30 })
    pager.setFilter({})
    const state = await drain(pager)
    expect(state).toMatchObject({ error: 'offline', complete: false })
    expect(state.rows).toHaveLength(30)
    pager.loadMore()
    expect((await drain(pager)).complete).toBe(true)
    expect(cursors[2]).toBe(cursors[1])
    expect(ids(pager.getState().rows)).toEqual(idsOf({}))
  })

  it('reports a first page that fails and reads it again when asked', async () => {
    const source = memorySource(ledger)
    failing(source, (call) => (call === 0 ? 'fail' : 'ok'))
    const pager = pagerOf(source, { limit: 30 })
    pager.setFilter({})
    expect(await drain(pager)).toMatchObject({ error: 'offline', rows: [] })
    pager.loadMore()
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}))
  })

  it('does not mend a cursor the server refused, and recovers when the list is read again from the start', async () => {
    const source = memorySource(ledger)
    failing(source, (call) => (call === 0 ? 'bad-cursor' : 'ok'))
    const pager = pagerOf(source, { limit: 30 })
    pager.setFilter({})
    const state = await drain(pager)
    expect(state.error).toMatch(/cursor/i)
    expect(state.rows).toHaveLength(30)
    pager.loadMore()
    expect((await settled(pager)).error).toMatch(/cursor/i)
    void pager.refresh()
    const recovered = await drain(pager)
    expect(recovered.error).toBeNull()
    expect(ids(recovered.rows)).toEqual(idsOf({}))
  })

  it('leaves the rows alone when only the summary cannot be read', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))
    const pager = pagerOf(source, { limit: 30 })
    pager.setFilter({})
    const state = await drain(pager)
    expect(state.error).toBeNull()
    expect(state.summary).toBeNull()
    expect(ids(state.rows)).toEqual(idsOf({}))
  })

  it('starts a list again for a filter set after it was disposed, as a screen mounted twice does', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 30 })
    pager.setFilter({ status: 'posted' })
    pager.dispose()
    pager.setFilter({ status: 'posted' })
    const state = await drain(pager)
    expect(ids(state.rows)).toEqual(idsOf({ status: 'posted' }))
  })

  it('changes nothing after it is disposed', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 30 })
    pager.setFilter({})
    pager.dispose()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pager.getState().rows).toEqual([])
  })
})

describe('TransactionPager, a filter the caller owns', () => {
  it('reads every page under a copy of the filter, so changing the original changes nothing', async () => {
    const source = memorySource(ledger)
    const seen: TxnFilter[] = []
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = (filter, request) => {
      seen.push(filter)
      return read(filter, request)
    }
    const month = vocabularyOf(ledger).months[10]!
    const labelIds = ledger.labels.map((label) => label.id)
    const wanted = { month, labelIds: [...labelIds], queryAmount: { fromCents: 100, toCents: 199 } }
    const original = { month, labelIds, queryAmount: { ...wanted.queryAmount } }
    const pager = pagerOf(source, { limit: 3 })
    pager.setFilter(original)
    await settled(pager)
    original.month = '1999-01'
    original.labelIds.push(9)
    original.queryAmount.toCents = 99_999
    await drain(pager)
    expect(seen.length).toBeGreaterThan(1)
    for (const filter of seen) {
      expect(filter).toEqual(wanted)
      expect(Object.isFrozen(filter) && Object.isFrozen(filter.labelIds) && Object.isFrozen(filter.queryAmount)).toBe(true)
    }
  })
})

describe('TransactionPager, a burst of filters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads only the filter it was left with, once the burst is over, and marks the rows stale meanwhile', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20, settleMs: 100 })
    pager.setFilter({})
    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(pager.getState().rows).toHaveLength(20))
    source.calls.length = 0
    for (const query of ['r', 're', 'ren', 'rent']) {
      pager.setFilter({ query })
      await vi.advanceTimersByTimeAsync(40)
    }
    expect(source.calls).toEqual([])
    expect(pager.getState()).toMatchObject({ stale: true, loading: false })
    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(ids(pager.getState().rows)).toEqual(idsOf({ query: 'rent' }).slice(0, 20)))
    expect(pager.getState().stale).toBe(false)
    expect(source.calls).toEqual(['page', 'summary'])
  })

  it('cancels the read of a list a new filter replaces, and a refresh need not wait for the burst to end', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const signals: AbortSignal[] = []
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = (filter, request) => {
      if (request?.signal) signals.push(request.signal)
      return read(filter, request)
    }
    const pager = pagerOf(source, { limit: 20, settleMs: 100 })
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(100)
    pager.setFilter({ status: 'posted', query: 'rent' })
    expect(signals[0]!.aborted).toBe(true)
    void pager.refresh()
    // Stale is also false before any page has come, so what is waited for is the rows.
    await vi.waitFor(() =>
      expect(ids(pager.getState().rows)).toEqual(idsOf({ status: 'posted', query: 'rent' }).slice(0, 20)),
    )
    expect(signals).toHaveLength(2)
  })

  it('reads nothing for a text the burst came back to, shows the rows as they were, and cancels what is in flight when disposed', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20, settleMs: 100 })
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(pager.getState().rows).toHaveLength(20))
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    const held = pager.getState()
    source.calls.length = 0
    pager.setFilter({ status: 'posted', query: 'shop' })
    expect(pager.getState().stale).toBe(true)
    pager.setFilter({ status: 'posted' })
    expect(pager.getState()).toMatchObject({ stale: false, rows: held.rows, summary: held.summary })
    await vi.advanceTimersByTimeAsync(300)
    expect(source.calls).toEqual([])
    pager.setFilter({ status: 'posted', query: 'rent' })
    pager.dispose()
    await vi.advanceTimersByTimeAsync(300)
    expect(source.calls).toEqual([])
  })

  it('waits only for the search text: any other change ends the burst and is read at once', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20, settleMs: 100 })
    pager.setFilter({})
    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(pager.getState().rows).toHaveLength(20))
    source.calls.length = 0
    pager.setFilter({ status: 'forecast' })
    expect(pager.getState()).toMatchObject({ stale: true, loading: true })
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(1)
    pager.setFilter({ status: 'forecast', query: 'r' })
    expect(pager.getState()).toMatchObject({ stale: true, loading: false })
    pager.setFilter({ status: 'posted', query: 'r' })
    expect(pager.getState()).toMatchObject({ stale: true, loading: true })
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(2)
    await vi.waitFor(() =>
      expect(ids(pager.getState().rows)).toEqual(idsOf({ status: 'posted', query: 'r' }).slice(0, 20)),
    )
  })
})

describe('TransactionPager, a summary that is never silently missing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the summary again when a refresh cancelled the first one before it arrived', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({})
    void pager.refresh()
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    expect(pager.getState()).toMatchObject({ summaryStale: false })
    expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, {}))
    expect(source.calls.filter((c) => c === 'summary')).toHaveLength(2)
  })

  it('reads the list and the summary again when the text was changed and put back while they were still being read', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20, settleMs: 50 })
    pager.setFilter({ status: 'posted' })
    pager.setFilter({ status: 'posted', query: 'shop' })
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(50)
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    expect(pager.getState().summaryStale).toBe(false)
    expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, { status: 'posted' }))
    await vi.waitFor(() => expect(ids(pager.getState().rows)).toEqual(idsOf({ status: 'posted' }).slice(0, 20)))
    expect(pager.getState().stale).toBe(false)
  })

  it('flags a summary that could not be read for a new filter, so that nothing is silently missing', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({})
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(true))
    expect(pager.getState().summary).toBeNull()
  })
})

describe('TransactionPager, the retry and the summary', () => {
  it('drops the old rows when the first page of a new filter fails, and reads it again when asked', async () => {
    const source = memorySource(ledger)
    const read = source.readTransactionPage.bind(source)
    let failures = 1
    source.readTransactionPage = async (filter, request) => {
      if (filter.status === 'forecast' && failures-- > 0) throw new Error('offline')
      return read(filter, request)
    }
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({ status: 'posted' })
    await settled(pager)
    pager.setFilter({ status: 'forecast' })
    expect(await settled(pager)).toMatchObject({ stale: false, error: 'offline', rows: [], refreshFailed: false })
    pager.loadMore()
    const state = await settled(pager)
    expect(state).toMatchObject({ stale: false, error: null })
    expect(ids(state.rows)).toEqual(idsOf({ status: 'forecast' }).slice(0, 20))
  })

  it('leaves the summary alone on a plain refresh and says it may no longer fit, and reads it again when asked', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({})
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    expect(pager.getState().summaryStale).toBe(false)
    source.calls.length = 0
    void pager.refresh()
    await drain(pager)
    expect(source.calls.filter((c) => c === 'summary')).toHaveLength(0)
    expect(pager.getState().summaryStale).toBe(true)
    void pager.refresh({ summary: true })
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    expect(source.calls.filter((c) => c === 'summary')).toHaveLength(1)
  })

  it('keeps the old summary and flags it when reading it again fails', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({})
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    const summary = pager.getState().summary
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))
    void pager.refresh({ summary: true })
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(true))
    expect(pager.getState().summary).toBe(summary)
  })

  it('has the list the engine makes once refreshed after the ledger moved rows behind the cursor', async () => {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 25 })
    pager.setFilter({})
    await settled(pager)
    const [moved, deleted] = [ledger.transactions[7]!, ledger.transactions[11]!]
    const changed: ExpenseDataset = {
      ...ledger,
      transactions: ledger.transactions
        .filter((t) => t.id !== deleted.id)
        .map((t) => (t.id === moved.id ? { ...t, date: '2019-01-01', budgetMonth: '2019-01' } : t)),
    }
    source.dataset = changed
    // Without a refresh the pages already read cannot see a row that moved behind the cursor, or one deleted.
    expect(ids((await drain(pager)).rows)).not.toEqual(idsOf({}, changed.transactions))
    void pager.refresh({ summary: true })
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}, changed.transactions))
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    expect(pager.getState().summary).toMatchObject(summaryOf(changed.transactions, {}))
  })
})

describe('TransactionPager, a refresh after a write', () => {
  /** Reads `pages` pages of a filter, as a reader scrolling down does. */
  async function scrolled(source: TestSource, pages: number, limit = 20) {
    const pager = pagerOf(source, { limit })
    pager.setFilter({})
    for (let at = 1; at < pages; at += 1) {
      await settled(pager)
      pager.loadMore()
    }
    await settled(pager)
    return pager
  }

  it('reads the list again to the depth it had in as few requests as the server allows, and swaps it once, when every row is in', async () => {
    const source = memorySource(ledger)
    const pager = await scrolled(source, 13)
    const held = pager.getState().rows
    expect(held).toHaveLength(260)
    const limits: Array<number | undefined> = []
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = (filter, request) => {
      limits.push(request?.limit)
      return read(filter, request)
    }
    const counts: number[] = []
    pager.subscribe(() => counts.push(pager.getState().rows.length))
    const edited = held[3]!
    const changed: ExpenseDataset = {
      ...ledger,
      transactions: ledger.transactions.map((t) => (t.id === edited.id ? { ...t, description: 'Edited' } : t)),
    }
    source.dataset = changed
    void pager.refresh({ summary: true })
    expect(pager.getState()).toMatchObject({ refreshing: true, loading: false, stale: false, complete: false })
    expect(pager.getState().rows).toBe(held)
    await settled(pager)
    expect(limits).toEqual([200, 60])
    expect(counts.every((count) => count === 260)).toBe(true)
    expect(ids(pager.getState().rows)).toEqual(idsOf({}, changed.transactions).slice(0, 260))
    expect(pager.getState().rows.find((t) => t.id === edited.id)?.description).toBe('Edited')
    expect(pager.getState()).toMatchObject({ refreshing: false, error: null })
    pager.loadMore()
    expect((await drain(pager)).complete).toBe(true)
    expect(ids(pager.getState().rows)).toEqual(idsOf({}, changed.transactions))
  })

  it('does not call a list that was whole unfinished while it is read again, so nothing that waits for the end is held back', async () => {
    const source = memorySource(ledger)
    const month = vocabularyOf(ledger).months[10]!
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter({ month })
    await drain(pager)
    expect(pager.getState().complete).toBe(true)
    void pager.refresh()
    expect(pager.getState()).toMatchObject({ complete: true, refreshing: true, stale: false })
    await settled(pager)
    expect(pager.getState().complete).toBe(true)
  })

  it('starts the read again when another write comes while one is on its way, and ends with the list after the last', async () => {
    const source = memorySource(ledger)
    const pager = await scrolled(source, 4)
    const signals: AbortSignal[] = []
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = (filter, request) => {
      if (request?.signal) signals.push(request.signal)
      return read(filter, request)
    }
    const [first, second] = [ledger.transactions[2]!, ledger.transactions[30]!]
    source.dataset = { ...ledger, transactions: ledger.transactions.filter((t) => t.id !== first.id) }
    void pager.refresh()
    const after: ExpenseDataset = { ...ledger, transactions: ledger.transactions.filter((t) => t.id !== first.id && t.id !== second.id) }
    source.dataset = after
    void pager.refresh()
    expect(signals[0]!.aborted).toBe(true)
    await settled(pager)
    expect(ids(pager.getState().rows)).toEqual(idsOf({}, after.transactions).slice(0, 80))
  })

  it('keeps the rows and says so when the refresh fails, and reads it again when asked', async () => {
    const source = memorySource(ledger)
    const pager = await scrolled(source, 3)
    const held = pager.getState().rows
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = () => Promise.reject(new Error('offline'))
    void pager.refresh()
    await vi.waitFor(() => expect(pager.getState().refreshFailed).toBe(true))
    expect(pager.getState()).toMatchObject({ error: 'offline', refreshing: false, stale: false })
    expect(pager.getState().rows).toBe(held)
    source.readTransactionPage = read
    pager.loadMore()
    expect(pager.getState()).toMatchObject({ refreshing: true, error: null, refreshFailed: false })
    await settled(pager)
    expect(ids(pager.getState().rows)).toEqual(idsOf({}).slice(0, 60))
  })
})

describe('TransactionPager, with no screen showing the list', () => {
  it('only notes a refresh, and reads the list from its first page when a screen attaches', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    const detach = pager.attach()
    pager.setFilter({})
    await settled(pager)
    pager.loadMore()
    await settled(pager)
    expect(pager.getState().rows).toHaveLength(40)
    detach()
    source.calls.length = 0
    void pager.refresh({ summary: true })
    expect(source.calls).toEqual([])
    pager.attach()
    expect(pager.getState().refreshing).toBe(true)
    await settled(pager)
    expect(source.calls).toEqual(['page', 'summary'])
    expect(pager.getState().rows).toHaveLength(20)
    pager.attach()
    expect(source.calls).toEqual(['page', 'summary'])
  })

  it('has nothing to refresh before a filter was ever set', () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    void pager.refresh({ summary: true })
    pager.attach()
    expect(source.calls).toEqual([])
  })
})

describe('TransactionPager, the rows a write on a filter may name', () => {
  const filter: TxnFilter = { categoryId: ledger.categories[0]!.id }

  async function ready(source = memorySource(ledger), options?: ConstructorParameters<typeof TransactionPager>[1]) {
    const pager = pagerOf(source, options)
    pager.setFilter(filter)
    await drain(pager)
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    return { pager, source }
  }

  it('gives the filter, the count and the revision the figures on screen were read for', async () => {
    const { pager, source } = await ready()

    expect(pager.matching()).toEqual({
      filter,
      expectedCount: summaryOf(ledger.transactions, filter).count,
      expectedRevision: source.revision,
    })
  })

  it('gives nothing while the figures may not fit the filter: typed, read again, or not read', async () => {
    const source = memorySource(ledger)
    const { pager } = await ready(source, { limit: 5, settleMs: 50 })
    expect(pager.matching()).not.toBeNull()

    // A burst of typing: the filter on screen is not the one the figures were read for.
    pager.setFilter({ ...filter, query: 'a' })
    expect(pager.matching()).toBeNull()
    await settled(pager)
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))

    // A refresh after a write: the figures in hand are from before it.
    void pager.refresh({ summary: true })
    expect(pager.matching()).toBeNull()
    await vi.waitFor(() => expect(pager.matching()).not.toBeNull())
  })

  it('gives nothing when more rows match than a write on a filter may reach', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () => Promise.resolve({ revision: 'r', count: 1000, capped: true, netSpendCents: 0 })
    const { pager } = await ready(source)

    expect(pager.matching()).toBeNull()
  })

  it('gives nothing once the figures could not be read again, because they are the ones before the write', async () => {
    const { pager, source } = await ready()
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))

    void pager.refresh({ summary: true })
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(true))

    expect(pager.matching()).toBeNull()
  })
})

describe('TransactionPager, what refresh reports', () => {
  async function scrolled(source: TestSource, pages: number, limit = 20) {
    const pager = pagerOf(source, { limit })
    pager.setFilter({})
    for (let at = 1; at < pages; at += 1) {
      await settled(pager)
      pager.loadMore()
    }
    await settled(pager)
    return pager
  }

  it('settles once the list has been read again, with the rows that read found', async () => {
    const source = memorySource(ledger)
    const pager = await scrolled(source, 3)
    const edited = pager.getState().rows[3]!
    source.dataset = { ...ledger, transactions: ledger.transactions.map((t) => (t.id === edited.id ? { ...t, description: 'Edited' } : t)) }
    const done = pager.refresh({ summary: true })
    expect(pager.getState().refreshing).toBe(true)
    await done
    expect(pager.getState()).toMatchObject({ refreshing: false, refreshFailed: false, error: null })
    expect(pager.getState().rows[3]!.description).toBe('Edited')
  })

  it('settles after a read that failed, and the state says it did', async () => {
    const source = memorySource(ledger)
    const pager = await scrolled(source, 3)
    source.readTransactionPage = () => Promise.reject(new Error('offline'))
    await pager.refresh()
    expect(pager.getState()).toMatchObject({ refreshing: false, refreshFailed: true, error: 'offline' })
  })

  it('settles at once, with nothing read, when no screen is showing the list or there is no filter', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source)
    await expect(pager.refresh()).resolves.toBeNull()
    pager.setFilter({})
    await settled(pager)
    source.calls.length = 0
    await expect(pager.refresh({ summary: true })).resolves.toBeNull()
    expect(source.calls).toEqual([])
    expect(pager.getState().refreshing).toBe(false)
  })

  it('says whether the read worked, and null for no read, even when an earlier read of the list failed', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    const detach = pager.attach()
    pager.setFilter({})
    await settled(pager)
    const read = source.readTransactionPage.bind(source)
    await expect(pager.refresh()).resolves.toBe(true)
    source.readTransactionPage = () => Promise.reject(new Error('offline'))
    await expect(pager.refresh()).resolves.toBe(false)
    expect(pager.getState().refreshFailed).toBe(true)
    source.readTransactionPage = read
    detach()
    await expect(pager.refresh()).resolves.toBeNull()
    expect(pager.getState().refreshFailed).toBe(true)
  })

  it('settles when a newer refresh has taken over its read, and the newer one is the one that decides what is shown', async () => {
    const source = memorySource(ledger)
    const pager = await scrolled(source, 2)
    const first = pager.refresh()
    const second = pager.refresh()
    await first
    await second
    expect(pager.getState()).toMatchObject({ refreshing: false, refreshFailed: false })
  })
})

describe('TransactionPager, rows patched in before the read that follows a write', () => {
  async function opened(filter: TxnFilter = {}) {
    const source = memorySource(ledger)
    const pager = pagerOf(source, { limit: 20 })
    pager.setFilter(filter)
    await settled(pager)
    return { source, pager }
  }

  it('shows an edited row at once, marks the figures, and ends with what the server says when it reads again', async () => {
    const { source, pager } = await opened()
    const row = pager.getState().rows[2]!
    pager.patchRows({ upserted: [{ ...row, description: 'Patched' }], removed: [] })
    expect(pager.getState().rows[2]!.description).toBe('Patched')
    expect(pager.getState().summaryStale).toBe(true)
    source.dataset = { ...ledger, transactions: ledger.transactions.map((t) => (t.id === row.id ? { ...t, description: 'What the server holds' } : t)) }
    await pager.refresh({ summary: true })
    expect(pager.getState().rows.find((r) => r.id === row.id)!.description).toBe('What the server holds')
    expect(pager.getState().summaryStale).toBe(false)
  })

  it('ends with the server’s rows when the server disagrees with the patch about which rows there are', async () => {
    const { source, pager } = await opened()
    const [first, second] = pager.getState().rows
    // The patch says the first row is gone and the server did not delete it; the server says the second one is gone.
    pager.patchRows({ upserted: [], removed: [first!.id] })
    expect(pager.getState().rows.some((r) => r.id === first!.id)).toBe(false)
    source.dataset = { ...ledger, transactions: ledger.transactions.filter((t) => t.id !== second!.id) }
    await pager.refresh({ summary: true })
    const held = pager.getState().rows
    expect(held.some((r) => r.id === first!.id)).toBe(true)
    expect(held.some((r) => r.id === second!.id)).toBe(false)
  })

  it('changes nothing for rows the filter does not match, or when the patch changes no row held', async () => {
    const { pager } = await opened({ categoryId: ledger.categories[0]!.id })
    const before = pager.getState()
    const outside = ledger.transactions.find((t) => t.categoryId !== ledger.categories[0]!.id)!
    pager.patchRows({ upserted: [{ ...outside, description: 'Elsewhere' }], removed: [] })
    pager.patchRows({ upserted: [], removed: [] })
    expect(pager.getState()).toBe(before)
  })

  it('does nothing when no filter was set', () => {
    const pager = pagerOf(memorySource(ledger))
    pager.patchRows({ upserted: [], removed: [1] })
    expect(pager.getState().rows).toEqual([])
  })

  it('does nothing while the search text is being typed, since what is on screen is not the list the text asks for', async () => {
    vi.useFakeTimers()
    const pager = pagerOf(memorySource(ledger), { limit: 20, settleMs: 200 })
    pager.setFilter({})
    await settled(pager)
    const rows = pager.getState().rows
    pager.setFilter({ query: 'm' })
    pager.patchRows({ upserted: [], removed: [rows[0]!.id] })
    expect(pager.getState().rows).toBe(rows)
    vi.useRealTimers()
  })

  it('does nothing while the rows are those of the filter before this one', async () => {
    const { pager } = await opened()
    const rows = pager.getState().rows
    pager.setFilter({ categoryId: ledger.categories[0]!.id })
    expect(pager.getState().stale).toBe(true)
    pager.patchRows({ upserted: [], removed: [rows[0]!.id] })
    expect(pager.getState().rows).toBe(rows)
  })
})
