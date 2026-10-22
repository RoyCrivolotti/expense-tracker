import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseDataSource } from '../data/dataSource'
import { holdParts } from '../data/ledgerHold'
import { readLedgerParts } from '../data/ledgerLoader'
import { saveLedgerSnapshot } from '../data/ledgerSnapshot'
import { allGroupsGranted } from '../domain/accessGroups'
import { FULL_HYDRATION_ROW_LIMIT } from '../domain/ledger'
import type { ExpenseDataset } from '../domain/types'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import { type TestSource, memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { ExpensesAppView } from './ExpensesApp'
import LedgerExpensesApp from './LedgerExpensesApp'
import { ToastProvider } from './hooks/ToastProvider'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

const dataset = syntheticLedger({ months: 8, perMonth: 8, seed: 6 })

/** A source that serves parts and, as the app's own does, the whole dataset. */
function servingSource(data: ExpenseDataset = dataset): TestSource & ExpenseDataSource & { load: ReturnType<typeof vi.fn> } {
  const parts = memorySource(data)
  return Object.assign(parts, { canWrite: false, load: vi.fn().mockResolvedValue(data) })
}

function renderApp(source: ExpenseDataSource, mode: 'on' | 'shadow' = 'on', accountEmail?: string) {
  return render(
    <ToastProvider>
      <LedgerExpensesApp
        source={source}
        mode={mode}
        fallback={<p>the whole dataset app</p>}
        view={ExpensesAppView}
        hubGrants={allGroupsGranted()}
        {...(accountEmail ? { accountEmail } : {})}
      />
    </ToastProvider>,
  )
}

describe('LedgerExpensesApp', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__ledgerShadow')
    vi.restoreAllMocks()
  })

  it('shows the app over the ledger for a ledger small enough to hold in full, without reading the dataset', async () => {
    const source = servingSource()
    renderApp(source)
    await screen.findByText('Recent activity')
    expect(screen.queryByText('the whole dataset app')).toBeNull()
    expect(source.calls.filter((c) => c === 'reference').length).toBeGreaterThan(0)
    expect(source.load).not.toHaveBeenCalled()
  })

  it('hands back to the whole dataset for a ledger too large to hold in full, before reading any rows', async () => {
    const source = servingSource()
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = async () => ({ ...(await read()), rowCount: FULL_HYDRATION_ROW_LIMIT + 1 })
    renderApp(source)
    await screen.findByText('the whole dataset app')
    expect(source.calls.filter((c) => c.startsWith('months:') || c.startsWith('cube:'))).toEqual([])
  })

  it('hands back to the whole dataset for a source that cannot serve parts', async () => {
    renderApp({ canWrite: false, load: vi.fn().mockResolvedValue(dataset) })
    await screen.findByText('the whole dataset app')
  })

  it('hands back when the first read fails and there is no snapshot to go on', async () => {
    const source = servingSource()
    source.readReferencePart = () => Promise.reject(new Error('down'))
    renderApp(source)
    await screen.findByText('the whole dataset app')
  })

  it('compares the ledger with the whole dataset in shadow mode, and finds nothing when they agree', async () => {
    const source = servingSource()
    renderApp(source, 'shadow')
    await screen.findByText('Recent activity')
    await waitFor(() => expect(source.load).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((globalThis as { __ledgerShadow?: { checks: number } }).__ledgerShadow?.checks).toBe(1))
    expect((globalThis as { __ledgerShadow?: { differences: string[] } }).__ledgerShadow?.differences).toEqual([])
  })

  it('reports in shadow mode what differs from the whole dataset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = servingSource()
    source.load.mockResolvedValue({ ...dataset, categories: dataset.categories.slice(1) })
    renderApp(source, 'shadow')
    await screen.findByText('Recent activity')
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect((globalThis as { __ledgerShadow?: { differences: string[] } }).__ledgerShadow?.differences).toContain('categories differ')
  })

  it('survives a whole dataset that cannot be read in shadow mode', async () => {
    const source = servingSource()
    source.load.mockRejectedValue(new Error('down'))
    renderApp(source, 'shadow')
    await screen.findByText('Recent activity')
    await waitFor(() => expect(source.load).toHaveBeenCalled())
    expect((globalThis as { __ledgerShadow?: unknown }).__ledgerShadow).toBeUndefined()
  })
})

describe('LedgerExpensesApp, offline', () => {
  let fake: FakeIndexedDb

  beforeEach(() => {
    fake = installFakeIndexedDb()
  })

  afterEach(() => {
    fake.uninstall()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  })

  async function snapshotFor(owner: string) {
    const held = holdParts(await readLedgerParts(memorySource(dataset)))
    await saveLedgerSnapshot(owner, held, held.months.at(-1)!)
  }

  it('shows the owner’s snapshot, reading nothing, when the browser is offline', async () => {
    await snapshotFor('alex@example.com')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const source = servingSource()
    renderApp(source, 'on', 'alex@example.com')
    await screen.findByText('Recent activity')
    expect(source.calls).toEqual([])
  })

  it('hands back to the whole dataset, whose own snapshot may serve, when offline with no ledger snapshot or another owner’s', async () => {
    await snapshotFor('sam@example.com')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    renderApp(servingSource(), 'on', 'alex@example.com')
    await screen.findByText('the whole dataset app')
  })
})
