import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionPager } from '../data/transactionPager'
import { summaryOf } from '../domain/data/transactionQueryOf'
import { computeCashReconciliation } from '../domain/engine/cashReconciliation'
import { filteredStatementPayments } from '../domain/engine/pagedListRows'
import { buildTransactionListRows } from '../domain/engine/transactionListRows'
import { filterTransactions, type TxnFilter } from '../domain/engine/transactions'
import type { ExpenseDataset } from '../domain/types'
import { memorySource, type TestSource } from '../testing/ledgerSource'
import { randomLedger } from '../testing/randomLedger'
import { buildExpenseModel } from './buildExpenseModel'
import { ConnectivityContext } from './hooks/connectivityContext'
import { pagedListOf } from './pagedTransactionList'
import type { ListView } from './transactionListView'
import type { ExpenseModel } from './useExpenseData'

/** Calls the observer back as the browser would, when the end of the rows comes near the screen. */
class FakeObserver {
  static live: FakeObserver[] = []
  private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.callback = callback
  }
  observe() {
    FakeObserver.live.push(this)
  }
  disconnect() {
    FakeObserver.live = FakeObserver.live.filter((o) => o !== this)
  }
  static nearScreen() {
    for (const observer of [...FakeObserver.live]) observer.callback([{ isIntersecting: true }])
  }
}

const ledger: ExpenseDataset = randomLedger(2)
const ids = (view: ListView) => view.results.map((t) => t.id)

function Harness({
  model,
  filter,
  onView,
}: {
  model: ExpenseModel
  filter: TxnFilter
  onView: (view: ListView) => void
}) {
  const view = model.pagedList!.useList(model, filter)
  onView(view)
  return <div data-testid="footer">{view.footer}</div>
}

function mount(source: TestSource, filter: TxnFilter = {}, options: { limit?: number; readOnly?: boolean } = {}) {
  const pager = new TransactionPager(source, { limit: options.limit ?? 25 })
  const model = { ...buildExpenseModel(ledger), pagedList: pagedListOf(pager) }
  const views: ListView[] = []
  const tree = (f: TxnFilter) => (
    <ConnectivityContext.Provider value={{ online: !options.readOnly, readOnly: options.readOnly ?? false }}>
      <Harness model={model} filter={f} onView={(view) => views.push(view)} />
    </ConnectivityContext.Provider>
  )
  const view = render(tree(filter))
  return { pager, model, views, last: () => views.at(-1)!, rerender: (f: TxnFilter) => view.rerender(tree(f)) }
}

beforeEach(() => {
  FakeObserver.live = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the paged list the Transactions tab reads in ledger mode', () => {
  it('is loading until the first page comes, then lists it with the count and net spend of the whole filter', async () => {
    const source = memorySource(ledger)
    const { last } = mount(source)
    expect(last()).toMatchObject({ loading: true, listRows: [], capped: true })
    await waitFor(() => expect(last().results.length).toBe(25))
    expect(last().loading).toBe(false)
    const whole = summaryOf(ledger.transactions, {})
    await waitFor(() => expect(last().totalCents).toBe(whole.netSpendCents))
    const payments = filteredStatementPayments(
      ledger.accountStatements,
      computeCashReconciliation(ledger.transactions, ledger.accounts, ledger.settings, ledger.cashActuals),
      ledger.accounts,
      ledger.settings,
      {},
    )
    expect(last().capped).toBe(whole.capped)
    expect(last().count).toBe(whole.count + (whole.capped ? 0 : payments.length))
  })

  it('says a thousand and more, not a count, when the summary stopped counting', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () =>
      Promise.resolve({ revision: 'r', count: 1000, capped: true, netSpendCents: -123_400 })
    const { last } = mount(source)
    await waitFor(() => expect(last()).toMatchObject({ count: 1000, capped: true, totalCents: -123_400 }))
  })

  it('is the engine list once every page has been read, statement payments included', async () => {
    const source = memorySource(ledger)
    const { last } = mount(source, { month: ledger.transactions[0]!.budgetMonth }, { limit: 7 })
    const filter = { month: ledger.transactions[0]!.budgetMonth }
    await waitFor(() => {
      act(() => FakeObserver.nearScreen())
      expect(last().capped).toBe(false)
    })
    const reference = buildTransactionListRows(
      ledger.transactions,
      filter,
      ledger.accountStatements,
      computeCashReconciliation(ledger.transactions, ledger.accounts, ledger.settings, ledger.cashActuals),
      ledger.accounts,
      ledger.settings,
    )
    const keys = (rows: ListView['listRows']) => rows.map((r) => (r.kind === 'transaction' ? r.txn.id : r.key))
    await waitFor(() => expect(keys(last().listRows)).toEqual(keys(reference)))
    expect(last().count).toBe(reference.length)
  })

  it('hands the screen\'s filter to the pager, and reads the rows of the new one when it changes', async () => {
    const source = memorySource(ledger)
    const { last, rerender } = mount(source, { status: 'posted' })
    await waitFor(() => expect(ids(last())).toEqual(filterTransactions(ledger.transactions, { status: 'posted' }).slice(0, 25).map((t) => t.id)))
    rerender({ status: 'forecast' })
    await waitFor(() => expect(ids(last())).toEqual(filterTransactions(ledger.transactions, { status: 'forecast' }).slice(0, 25).map((t) => t.id)))
  })

  it('has no rows, and is not loading, when the filter matches nothing', async () => {
    const source = memorySource(ledger)
    const { last } = mount(source, { query: 'no description here' })
    await waitFor(() => expect(last()).toMatchObject({ loading: false, count: 0, capped: false }))
    expect(last().listRows).toEqual(expect.not.arrayContaining([expect.objectContaining({ kind: 'transaction' })]))
  })

  it('lists what the model holds, and reads nothing, while it is read-only', () => {
    const source = memorySource(ledger)
    const { last } = mount(source, { month: ledger.transactions[0]!.budgetMonth }, { readOnly: true })
    const held = filterTransactions(ledger.transactions, { month: ledger.transactions[0]!.budgetMonth })
    expect(ids(last())).toEqual(held.map((t) => t.id))
    expect(last().footer).toBeUndefined()
    expect(source.calls).toEqual([])
  })
})

describe('the footer under the paged list', () => {
  it('reads the next page when the end of the rows comes near the screen, and not before', async () => {
    const source = memorySource(ledger)
    const { last } = mount(source, {}, { limit: 20 })
    await waitFor(() => expect(last().results).toHaveLength(20))
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(1)
    act(() => FakeObserver.nearScreen())
    await waitFor(() => expect(last().results).toHaveLength(40))
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(2)
  })

  it('says it is loading while a page is on its way, and offers to try again when one failed, without trying by itself', async () => {
    const source = memorySource(ledger)
    const read = source.readTransactionPage.bind(source)
    let failures = 1
    source.readTransactionPage = (filter, request) => {
      if (request?.cursor && failures-- > 0) return Promise.reject(new Error('offline'))
      return read(filter, request)
    }
    const { last } = mount(source, {}, { limit: 20 })
    await waitFor(() => expect(last().results).toHaveLength(20))
    act(() => FakeObserver.nearScreen())
    await screen.findByRole('button', { name: /try again/i })
    const pageCalls = source.calls.filter((c) => c === 'page').length
    act(() => FakeObserver.nearScreen())
    await act(() => Promise.resolve())
    expect(source.calls.filter((c) => c === 'page')).toHaveLength(pageCalls)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(last().results).toHaveLength(40))
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('stops watching once the last page has come', async () => {
    const source = memorySource(ledger)
    const { last } = mount(source, { month: ledger.transactions[0]!.budgetMonth }, { limit: 200 })
    await waitFor(() => expect(last().capped).toBe(false))
    expect(FakeObserver.live).toHaveLength(0)
  })
})
