import { describe, expect, it, vi } from 'vitest'
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
      const pager = new TransactionPager(source, [7, 50, 100, 200][at % 4])
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
    const pager = new TransactionPager(source, 15)
    const month = vocabularyOf(ledger).months[10]!
    const first: TxnFilter = { month, status: 'all' }
    pager.setFilter(first)
    await settled(pager)
    pager.setFilter({ month })
    await drain(pager)
    expect(seen.length).toBeGreaterThan(2)
    expect(seen.every(([filter]) => filter === first)).toBe(true)
    expect(seen.map(([, cursor]) => cursor)).toEqual([undefined, ...cursors.slice(0, -1)])
  })

  it('starts over for a filter that selects other rows, keeping the old rows, marked, until its first page arrives', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, 20)
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
    const pager = new TransactionPager(source, 20)
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
    const pager = new TransactionPager(source, 20)
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
    const pager = new TransactionPager(source, limit)
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
    const pager = new TransactionPager(source, 50)
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
    const pager = new TransactionPager(source, 30)
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
    const pager = new TransactionPager(source, 30)
    pager.setFilter({})
    expect(await drain(pager)).toMatchObject({ error: 'offline', rows: [] })
    pager.loadMore()
    expect(ids((await drain(pager)).rows)).toEqual(idsOf({}))
  })

  it('does not mend a cursor the server refused, and recovers when the list is read again from the start', async () => {
    const source = memorySource(ledger)
    failing(source, (call) => (call === 0 ? 'bad-cursor' : 'ok'))
    const pager = new TransactionPager(source, 30)
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
    const pager = new TransactionPager(source, 30)
    pager.setFilter({})
    const state = await drain(pager)
    expect(state.error).toBeNull()
    expect(state.summary).toBeNull()
    expect(ids(state.rows)).toEqual(idsOf({}))
  })

  it('changes nothing after it is disposed', async () => {
    const source = memorySource(ledger)
    const pager = new TransactionPager(source, 30)
    pager.setFilter({})
    pager.dispose()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pager.getState().rows).toEqual([])
  })
})
