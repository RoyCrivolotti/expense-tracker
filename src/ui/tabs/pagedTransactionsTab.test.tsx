/**
 * The Transactions tab over a list read in pages (ledger mode), as a reader sees it: the header, the dimming while
 * a filter changes, the words when a page could not be read, the footer and the rows that stay through a write.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionPager } from '../../data/transactionPager'
import type { ExpenseDataset } from '../../domain/types'
import { makeActions } from '../../testing/makeActions'
import { memorySource, type TestSource } from '../../testing/ledgerSource'
import { syntheticLedger } from '../../testing/syntheticLedger'
import { buildExpenseModel } from '../buildExpenseModel'
import { ConnectivityContext } from '../hooks/connectivityContext'
import { ToastProvider } from '../hooks/ToastProvider'
import { pagedListOf } from '../pagedTransactionList'
import type { ExpenseModel } from '../useExpenseData'
import { RESULTS_ANCHOR_ID } from './scrollToResults'
import { TransactionsTab } from './TransactionsTab'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  })
})

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

const ledger: ExpenseDataset = syntheticLedger({ months: 6, perMonth: 30, seed: 4 })
const month = ledger.transactions[0]!.budgetMonth

/** Holds the reads of a kind until the test lets one through, so that what is on screen meanwhile can be looked at. */
function gate(source: TestSource) {
  const open = { pages: true, summaries: true }
  const waiting: Array<() => void> = []
  const hold = <T,>(run: () => Promise<T>, on: boolean) =>
    on ? run() : new Promise<T>((resolve) => waiting.push(() => resolve(run())))
  const page = source.readTransactionPage.bind(source)
  const summary = source.readTransactionSummary.bind(source)
  source.readTransactionPage = (filter, request) => hold(() => page(filter, request), open.pages)
  source.readTransactionSummary = (filter, request) => hold(() => summary(filter, request), open.summaries)
  return {
    open,
    release: () =>
      act(() => {
        open.pages = true
        open.summaries = true
        waiting.splice(0).forEach((resolve) => resolve())
        return Promise.resolve()
      }),
  }
}

function renderTab(source: TestSource, options: { limit?: number; settleMs?: number } = {}) {
  const pager = new TransactionPager(source, { limit: options.limit ?? 10, settleMs: options.settleMs ?? 0 })
  const model: ExpenseModel = { ...buildExpenseModel(ledger), pagedList: pagedListOf(pager) }
  const tree = (
    <ToastProvider>
      <ConnectivityContext.Provider value={{ online: true, readOnly: false }}>
        <TransactionsTab model={model} month={month} actions={makeActions()} />
      </ConnectivityContext.Provider>
    </ToastProvider>
  )
  return { pager, model, ...render(tree) }
}

const stats = () => within(document.getElementById(RESULTS_ANCHOR_ID)!)
const statsNode = () => document.getElementById(RESULTS_ANCHOR_ID)!.querySelector('[data-stale]')
const listFrame = () => document.querySelector('[aria-busy]')
const search = () => screen.getByPlaceholderText(/search description/i)

beforeEach(() => {
  FakeObserver.live = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Transactions tab over a list read in pages: the header', () => {
  it('says a thousand and more, in the header and to a screen reader, while the count has stopped', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () =>
      Promise.resolve({ revision: 'r', count: 1000, capped: true, netSpendCents: -123_400 })
    renderTab(source)
    expect(await stats().findByText('1000+ items')).toBeInTheDocument()
    expect(stats().getByText('−1.234,00 €')).toBeInTheDocument()
    expect(await screen.findByText('1000+ transactions match', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('gives the exact count once the whole list has been read, whatever the summary stopped at', async () => {
    const source = memorySource(ledger)
    source.readTransactionSummary = () =>
      Promise.resolve({ revision: 'r', count: 1000, capped: true, netSpendCents: -123_400 })
    renderTab(source, { limit: 200 })
    await waitFor(() => expect(stats().queryByText(/\+ items?$/)).toBeNull())
    expect(stats().getByText(/^\d+ items?$/)).toBeInTheDocument()
    expect(stats().queryByText('−1.234,00 €')).toBeNull()
  })

  it('has no net spend to give until the figures come, and does not pass off the rows read so far as it', async () => {
    const source = memorySource(ledger)
    const held = gate(source)
    held.open.summaries = false
    renderTab(source)
    expect(await stats().findByText(/^10\+ items$/)).toBeInTheDocument()
    expect(stats().getByText('—')).toBeInTheDocument()
    await held.release()
    await waitFor(() => expect(stats().queryByText('—')).toBeNull())
  })
})

describe('the Transactions tab over a list read in pages: a filter that changes', () => {
  it('keeps the old rows and figures on screen, dimmed and marked busy, until the new ones come', async () => {
    const source = memorySource(ledger)
    const held = gate(source)
    renderTab(source)
    await waitFor(() => expect(listFrame()).toHaveAttribute('aria-busy', 'false'))
    await waitFor(() => expect(statsNode()).toBeNull())
    const before = stats().getByText(/items?$/).textContent
    held.open.pages = false
    held.open.summaries = false
    await userEvent.type(search(), 'a')
    await waitFor(() => expect(listFrame()).toHaveAttribute('aria-busy', 'true'))
    expect(statsNode()).not.toBeNull()
    expect(stats().getByText(/items?$/).textContent).toBe(before)
    await held.release()
    await waitFor(() => expect(listFrame()).toHaveAttribute('aria-busy', 'false'))
    await waitFor(() => expect(statsNode()).toBeNull())
  })

  it('says the list could not be loaded when its first page fails, and not that nothing matches', async () => {
    const source = memorySource(ledger)
    const read = source.readTransactionPage.bind(source)
    let failing = false
    source.readTransactionPage = (filter, request) => (failing ? Promise.reject(new Error('offline')) : read(filter, request))
    renderTab(source)
    await waitFor(() => expect(listFrame()).toHaveAttribute('aria-busy', 'false'))
    failing = true
    await userEvent.type(search(), 'a')
    expect(await screen.findByText("Couldn't load transactions.")).toBeInTheDocument()
    expect(screen.queryByText('No transactions match these filters.')).toBeNull()
    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText("Couldn't load transactions.")).toBeNull())
    expect(listFrame()).toHaveAttribute('aria-busy', 'false')
  })

  it('says Loading while the first rows come, and that nothing matches only when that is the answer', async () => {
    const source = memorySource(ledger)
    const held = gate(source)
    held.open.pages = false
    renderTab(source)
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('No transactions match these filters.')).toBeNull()
    await held.release()
    await userEvent.type(search(), 'zzzz no such description')
    expect(await screen.findByText('No transactions match these filters.')).toBeInTheDocument()
  })
})

describe('the Transactions tab over a list read in pages: select all', () => {
  it('names how many rows it selects while more match, and says all once the list is complete', async () => {
    const source = memorySource(ledger)
    const { pager } = renderTab(source, { limit: 20 })
    await waitFor(() => expect(pager.getState().rows).toHaveLength(20), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(await screen.findByRole('button', { name: 'Select 20' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select all' })).toBeNull()
    act(() => FakeObserver.nearScreen())
    await waitFor(() => expect(pager.getState().complete).toBe(true), { timeout: 5000 })
    expect(await screen.findByRole('button', { name: 'Select all' })).toBeInTheDocument()
  }, 15_000)
})

describe('the Transactions tab over a list read in pages: a write', () => {
  /** The ledger with one row of the list renamed, which is what the server holds after the edit. */
  const renamed = (id: number): ExpenseDataset => ({
    ...ledger,
    transactions: ledger.transactions.map((t) => (t.id === id ? { ...t, description: 'Renamed by the test' } : t)),
  })

  it('keeps every row it had on screen while the list is read again, and shows the edit when all of it is in', async () => {
    const source = memorySource(ledger)
    const { pager } = renderTab(source, { limit: 10 })
    await waitFor(() => expect(pager.getState().rows).toHaveLength(10))
    for (const rows of [20, 30]) {
      act(() => FakeObserver.nearScreen())
      await waitFor(() => expect(pager.getState().rows).toHaveLength(rows))
    }
    const held = pager.getState().rows
    const counts: number[] = []
    pager.subscribe(() => counts.push(pager.getState().rows.length))
    const target = held[25]!
    source.dataset = renamed(target.id)
    const gated = gate(source)
    gated.open.pages = false
    act(() => pager.refresh({ summary: true }))
    expect(pager.getState().refreshing).toBe(true)
    expect(pager.getState().rows).toBe(held)
    expect(screen.queryByText('Loading…')).toBeNull()
    await gated.release()
    await waitFor(() => expect(screen.getByText('Renamed by the test')).toBeInTheDocument())
    expect(counts.every((count) => count === 30)).toBe(true)
    expect(pager.getState().rows).toHaveLength(30)
  })

  it('says it could not update the list when the read after a write fails, and reads it again from the button, keeping the focus', async () => {
    const source = memorySource(ledger)
    const { pager } = renderTab(source, { limit: 10 })
    await waitFor(() => expect(pager.getState().rows).toHaveLength(10))
    const read = source.readTransactionPage.bind(source)
    source.readTransactionPage = () => Promise.reject(new Error('offline'))
    act(() => pager.refresh())
    const retry = await screen.findByRole('button', { name: "Couldn't update the list. Try again" })
    retry.focus()
    source.readTransactionPage = read
    fireEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('button', { name: /try again/i })).toBeNull())
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })
})
