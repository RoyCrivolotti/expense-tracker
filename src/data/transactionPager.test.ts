import { afterEach, describe, expect, it, vi } from 'vitest'
import { summaryOf } from '../domain/data/transactionQueryOf'
import { filterTransactions, type TxnFilter } from '../domain/engine/transactions'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { makeTransaction } from '../testing/factories'
import { memorySource, type TestSource } from '../testing/ledgerSource'
import { awkwardLedger, filterStream, vocabularyOf } from '../testing/transactionQueryKit'
import { TransactionPager, type PagerState } from './transactionPager'

/** Resolves once no page is on its way. */
function settled(pager: TransactionPager): Promise<PagerState> {
  return new Promise((resolve) => {
    const check = () => {
      if (pager.getState().loading) return
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
      const pager = new TransactionPager(source, { limit: [7, 50, 100, 200][at % 4]! })
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
    const pager = new TransactionPager(source, { limit: 15 })
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

  it('starts over for a filter that selects other rows, keeping the old rows, marked, until its first page arrives', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    pager.setFilter({ status: 'posted' })
    await settled(pager)
    const before = pager.getState()
    pager.setFilter({ status: 'forecast' })
    expect(pager.getState()).toMatchObject({ stale: true, loading: true, complete: false, summary: null })
    expect(pager.getState().rows).toBe(before.rows)
    pager.loadMore()
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(2)
    const state = await settled(pager)
    expect(state.stale).toBe(false)
    expect(ids(state.rows)).toEqual(idsOf({ status: 'forecast' }).slice(0, 20))
  })

  it('drops the answer of a page that was asked for under an earlier filter', async () => {
    const source = memorySource(ledger)
    const read = source.readTransactionPage.bind(source)
    const release: Array<() => void> = []
    source.readTransactionPage = (filter, request) =>
      new Promise((resolve) => release.push(() => resolve(read(filter, request))))
    const pager = new TransactionPager(source, { limit: 20 })
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
    const pager = new TransactionPager(source, { limit: 20 })
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
    const pager = new TransactionPager(source, { limit })
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
    pager.refresh()
    expect(pager.getState().stale).toBe(true)
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}, changed.transactions))
  })

  it('keeps a row deleted from the pages already read until the list is read again, and never hides another', async () => {
    const gone = first[5]!
    const { state, pager, changed } = await afterFirstPage((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== gone.id) }))
    expect(ids(state.rows)).toEqual(ids(first))
    pager.refresh()
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}, changed.transactions))
  })

  it('keeps the summary through a refresh and drops it for a filter that selects other rows', async () => {
    const source = memorySource(ledger)
    const [january, february] = vocabularyOf(ledger).months
    const pager = new TransactionPager(source, { limit: 50 })
    pager.setFilter({ month: january! })
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    const summary = pager.getState().summary
    pager.refresh()
    expect(pager.getState().summary).toBe(summary)
    pager.setFilter({ month: february! })
    expect(pager.getState().summary).toBeNull()
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
    const pager = new TransactionPager(source, { limit: 30 })
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
    const pager = new TransactionPager(source, { limit: 30 })
    pager.setFilter({})
    expect(await drain(pager)).toMatchObject({ error: 'offline', rows: [] })
    pager.loadMore()
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}))
  })

  it('does not mend a cursor the server refused, and recovers when the list is read again from the start', async () => {
    const source = memorySource(ledger)
    failing(source, (call) => (call === 0 ? 'bad-cursor' : 'ok'))
    const pager = new TransactionPager(source, { limit: 30 })
    pager.setFilter({})
    const state = await drain(pager)
    expect(state.error).toMatch(/cursor/i)
    expect(state.rows).toHaveLength(30)
    pager.loadMore()
    expect((await settled(pager)).error).toMatch(/cursor/i)
    pager.refresh()
    const recovered = await drain(pager)
    expect(recovered.error).toBeNull()
    expect(ids(recovered.rows)).toEqual(idsOf({}))
  })

  it('leaves the rows alone when only the summary cannot be read', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))
    const pager = new TransactionPager(source, { limit: 30 })
    pager.setFilter({})
    const state = await drain(pager)
    expect(state.error).toBeNull()
    expect(state.summary).toBeNull()
    expect(ids(state.rows)).toEqual(idsOf({}))
  })

  it('starts a list again for a filter set after it was disposed, as a screen mounted twice does', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 30 })
    pager.setFilter({ status: 'posted' })
    pager.dispose()
    pager.setFilter({ status: 'posted' })
    const state = await drain(pager)
    expect(ids(state.rows)).toEqual(idsOf({ status: 'posted' }))
  })

  it('changes nothing after it is disposed', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 30 })
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
    const pager = new TransactionPager(source, { limit: 3 })
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
    const pager = new TransactionPager(source, { limit: 20, settleMs: 100 })
    pager.setFilter({})
    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(pager.getState().rows).toHaveLength(20))
    source.calls.length = 0
    for (const query of ['r', 're', 'ren', 'rent']) {
      pager.setFilter({ query })
      await vi.advanceTimersByTimeAsync(40)
    }
    expect(source.calls).toEqual([])
    expect(pager.getState()).toMatchObject({ stale: true, loading: false, summary: null })
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
    const pager = new TransactionPager(source, { limit: 20, settleMs: 100 })
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(100)
    pager.setFilter({ status: 'forecast' })
    expect(signals[0]!.aborted).toBe(true)
    pager.refresh()
    // Stale is also false before any page has come, so what is waited for is the rows.
    await vi.waitFor(() => expect(ids(pager.getState().rows)).toEqual(idsOf({ status: 'forecast' }).slice(0, 20)))
    expect(signals).toHaveLength(2)
  })

  it('reads nothing for a filter the burst came back to, and cancels what is in flight when disposed', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20, settleMs: 100 })
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(100)
    source.calls.length = 0
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(300)
    expect(source.calls).toEqual([])
    pager.setFilter({ status: 'forecast' })
    pager.dispose()
    await vi.advanceTimersByTimeAsync(300)
    expect(source.calls).toEqual([])
  })
})

describe('TransactionPager, a summary that is never silently missing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the summary again when a refresh cancelled the first one before it arrived', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    pager.setFilter({})
    pager.refresh()
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    expect(pager.getState()).toMatchObject({ summaryStale: false })
    expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, {}))
    expect(source.calls.filter((c) => c === 'summary')).toHaveLength(2)
  })

  it('reads it again when the filter was changed and put back before it settled', async () => {
    vi.useFakeTimers()
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20, settleMs: 50 })
    pager.setFilter({ status: 'posted' })
    await vi.advanceTimersByTimeAsync(50)
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    pager.setFilter({ status: 'forecast' })
    pager.setFilter({ status: 'posted' })
    expect(pager.getState().summary).toBeNull()
    await vi.advanceTimersByTimeAsync(50)
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    expect(pager.getState().summaryStale).toBe(false)
    expect(pager.getState().summary).toMatchObject(summaryOf(ledger.transactions, { status: 'posted' }))
    await vi.waitFor(() => expect(ids(pager.getState().rows)).toEqual(idsOf({ status: 'posted' }).slice(0, 20)))
  })

  it('flags a summary that could not be read for a new filter, so that nothing is silently missing', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))
    const pager = new TransactionPager(source, { limit: 20 })
    pager.setFilter({})
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(true))
    expect(pager.getState().summary).toBeNull()
  })
})

describe('TransactionPager, the retry and the summary', () => {
  it('reads the first page of a new filter again when asked, with the old rows still shown', async () => {
    const source = memorySource(ledger)
    const read = source.readTransactionPage.bind(source)
    let failures = 1
    source.readTransactionPage = async (filter, request) => {
      if (filter.status === 'forecast' && failures-- > 0) throw new Error('offline')
      return read(filter, request)
    }
    const pager = new TransactionPager(source, { limit: 20 })
    pager.setFilter({ status: 'posted' })
    await settled(pager)
    pager.setFilter({ status: 'forecast' })
    expect(await settled(pager)).toMatchObject({ stale: true, error: 'offline' })
    expect(pager.getState().rows).toHaveLength(20)
    pager.loadMore()
    const state = await settled(pager)
    expect(state).toMatchObject({ stale: false, error: null })
    expect(ids(state.rows)).toEqual(idsOf({ status: 'forecast' }).slice(0, 20))
  })

  it('leaves the summary alone on a plain refresh and says it may no longer fit, and reads it again when asked', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    pager.setFilter({})
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    expect(pager.getState().summaryStale).toBe(false)
    source.calls.length = 0
    pager.refresh()
    await drain(pager)
    expect(source.calls.filter((c) => c === 'summary')).toHaveLength(0)
    expect(pager.getState().summaryStale).toBe(true)
    pager.refresh({ summary: true })
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    expect(source.calls.filter((c) => c === 'summary')).toHaveLength(1)
  })

  it('keeps the old summary and flags it when reading it again fails', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 20 })
    pager.setFilter({})
    await vi.waitFor(() => expect(pager.getState().summary).not.toBeNull())
    const summary = pager.getState().summary
    source.readTransactionSummary = () => Promise.reject(new Error('offline'))
    pager.refresh({ summary: true })
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(true))
    expect(pager.getState().summary).toBe(summary)
  })

  it('has the list the engine makes once refreshed after the ledger moved rows behind the cursor', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, { limit: 25 })
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
    pager.refresh({ summary: true })
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}, changed.transactions))
    await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
    expect(pager.getState().summary).toMatchObject(summaryOf(changed.transactions, {}))
  })
})
