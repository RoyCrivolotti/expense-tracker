import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../data/apiDataSource'
import type { ExpenseDataSource } from '../data/dataSource'
import { holdParts } from '../data/ledgerHold'
import { readLedgerParts } from '../data/ledgerLoader'
import { saveLedgerSnapshot } from '../data/ledgerSnapshot'
import { allGroupsGranted } from '../domain/accessGroups'
import { FULL_HYDRATION_ROW_LIMIT, HYDRATED_DATA_MONTHS } from '../domain/ledger'
import type { ExpenseDataset } from '../domain/types'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import { type TestSource, memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { patchAfterFlagDelete } from './datasetPatches'
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
/** More months with data than a window holds as rows. */
const long = syntheticLedger({ months: HYDRATED_DATA_MONTHS + 11, perMonth: 8, seed: 6 })

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

  it('stays on the ledger for a ledger of exactly the limit, which is held in full', async () => {
    const source = servingSource()
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = async () => ({ ...(await read()), rowCount: FULL_HYDRATION_ROW_LIMIT })
    renderApp(source)
    await screen.findByText('Recent activity')
    expect(screen.queryByText('the whole dataset app')).toBeNull()
    expect(source.load).not.toHaveBeenCalled()
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

describe('LedgerExpensesApp, the source the view writes to', () => {
  /** Renders the app over `source` with a view that only says which source it was given. */
  async function sourceGiven(source: ExpenseDataSource): Promise<ExpenseDataSource | undefined> {
    let given: ExpenseDataSource | undefined
    const view = ((props: { source: ExpenseDataSource }) => {
      given = props.source
      return <p>the view</p>
    }) as unknown as typeof ExpensesAppView
    render(
      <ToastProvider>
        <LedgerExpensesApp source={source} mode="on" fallback={<p>the whole dataset app</p>} view={view} hubGrants={allGroupsGranted()} />
      </ToastProvider>,
    )
    await screen.findByText('the view')
    return given
  }

  it('is the source it was handed, unless that is the API', async () => {
    const source = servingSource()
    expect(await sourceGiven(source)).toBe(source)
  })

  it('is the API with the bulk writes that split a list longer than a request, and edit on a filter', async () => {
    // The API's reads are served from memory, so that the app opens; its writes are the ones under test.
    const served = memorySource(dataset)
    const original = { ...apiDataSource }
    Object.assign(apiDataSource, served)
    try {
      const given = await sourceGiven(apiDataSource)
      expect(given).not.toBe(apiDataSource)
      expect(Object.keys(given ?? {})).toEqual(expect.arrayContaining(['updateMatchingTransactions', 'addLabelsToTransactions']))
      expect('updateMatchingTransactions' in apiDataSource).toBe(false)
    } finally {
      for (const key of Object.keys(served)) {
        if (key in original) Object.assign(apiDataSource, { [key]: original[key as keyof typeof original] })
        else Reflect.deleteProperty(apiDataSource, key)
      }
    }
  })
})

describe('LedgerExpensesApp, a ledger that changes while it is open', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A view that records what the screens were given, and keeps the handles to refresh and to write. */
  function watched() {
    const seen: Array<number | undefined> = []
    const handle: { data?: Parameters<typeof ExpensesAppView>[0]['data'] } = {}
    const view: typeof ExpensesAppView = (props) => {
      handle.data = props.data
      seen.push(props.data.model?.dataset.transactions.length)
      return <ExpensesAppView {...props} />
    }
    return { seen, handle, view }
  }

  function renderWatched(source: ExpenseDataSource, view: typeof ExpensesAppView) {
    return render(
      <ToastProvider>
        <LedgerExpensesApp
          source={source}
          mode="on"
          fallback={<p>the whole dataset app</p>}
          view={view}
          hubGrants={allGroupsGranted()}
        />
      </ToastProvider>,
    )
  }

  it('hands back, and never shows part of the ledger as all of it, when it grows past the limit between two refreshes', async () => {
    const source = servingSource(long)
    const { seen, handle, view } = watched()
    renderWatched(source, view)
    await screen.findByText('Recent activity')
    const all = long.transactions.length
    expect(seen.at(-1)).toBe(all)
    // The next read finds more rows than the app lists in full.
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = async () => ({ ...(await read()), rowCount: FULL_HYDRATION_ROW_LIMIT + 1 })
    act(() => handle.data!.reload())
    await screen.findByText('the whole dataset app')
    expect(seen.filter((rows) => rows !== undefined && rows < all)).toEqual([])
  })

  it('hands back the same way when the ledger had grown before the first read was held', async () => {
    const source = servingSource(long)
    const read = source.readReferencePart.bind(source)
    let reads = 0
    // The check at the start sees a ledger that fits; the read that opens the session sees one that does not.
    source.readReferencePart = async () => ({ ...(await read()), ...(++reads > 1 ? { rowCount: FULL_HYDRATION_ROW_LIMIT + 1 } : {}) })
    const { seen, view } = watched()
    renderWatched(source, view)
    await screen.findByText('the whole dataset app')
    expect(seen.filter((rows) => rows !== undefined)).toEqual([])
  })

  it('tells the user, with a way to read again, when a read in the background fails', async () => {
    const source = servingSource(long)
    const { handle, view } = watched()
    renderWatched(source, view)
    await screen.findByText('Recent activity')
    const read = source.readReferencePart.bind(source)
    source.readReferencePart = () => Promise.reject(new Error('down'))
    const flagId = handle.data!.model!.dataset.flags[0]!.id
    act(() => handle.data!.applyPatch((d) => patchAfterFlagDelete(d, flagId)))
    await screen.findByText('Some figures may be out of date.')
    source.readReferencePart = read
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('Updated', undefined, { timeout: 3000 })
    await waitFor(() => expect(handle.data!.backgroundError).toBeNull())
  })
})

describe('LedgerExpensesApp, the Transactions tab', () => {
  type Served = ReturnType<typeof servingSource>
  const pages = (source: Served) => source.calls.filter((c) => c === 'page').length

  async function onTransactions(source: Served) {
    renderApp(source)
    await screen.findByText('Recent activity')
    fireEvent.click(screen.getAllByRole('button', { name: 'Transactions' })[0]!)
    return screen.findByPlaceholderText(/Search description/)
  }

  it('lists the month from a page read from the server, with its count and net spend, not from the rows it holds', async () => {
    const source = servingSource()
    await onTransactions(source)
    await waitFor(() => expect(pages(source)).toBeGreaterThan(0))
    await screen.findByText(/\d+ items?$/)
    await waitFor(() => expect(source.calls).toContain('summary'))
  })

  it('reads once for a burst of keys in the search box, after the text has held still', async () => {
    const source = servingSource()
    const search = await onTransactions(source)
    await waitFor(() => expect(pages(source)).toBeGreaterThan(0))
    await waitFor(() => expect(source.calls).toContain('summary'))
    const before = pages(source)
    for (const text of ['c', 'co', 'cof', 'coff']) fireEvent.change(search, { target: { value: text } })
    expect(pages(source)).toBe(before)
    await waitFor(() => expect(pages(source)).toBe(before + 1), { timeout: 2000 })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(pages(source)).toBe(before + 1)
  })

  it('shows what the first page of a search holds, and the rows of the filter before it cleared', async () => {
    const source = servingSource()
    const search = await onTransactions(source)
    await waitFor(() => expect(pages(source)).toBeGreaterThan(0))
    fireEvent.change(search, { target: { value: 'zzz no such description' } })
    await screen.findByText(/No transactions match these filters/, undefined, { timeout: 2000 })
    fireEvent.change(search, { target: { value: '' } })
    await waitFor(() => expect(screen.queryByText(/No transactions match these filters/)).toBeNull(), { timeout: 2000 })
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

  it('hands back when the only snapshot holds a window, which would show part of the ledger as all of it', async () => {
    const held = holdParts(
      await readLedgerParts(memorySource(long), { policy: { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS } }),
    )
    expect(held.cells).not.toBeNull()
    await saveLedgerSnapshot('alex@example.com', held, held.months.at(-1)!)
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    renderApp(servingSource(), 'on', 'alex@example.com')
    await screen.findByText('the whole dataset app')
  })

  it('hands back to the whole dataset, whose own snapshot may serve, when offline with no ledger snapshot or another owner’s', async () => {
    await snapshotFor('sam@example.com')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    renderApp(servingSource(), 'on', 'alex@example.com')
    await screen.findByText('the whole dataset app')
  })
})
