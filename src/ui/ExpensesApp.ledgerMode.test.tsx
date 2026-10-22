import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../config/ledgerMode'
import type { ExpenseDataSource } from '../data/dataSource'
import { allGroupsGranted } from '../domain/accessGroups'
import { memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { buildExpenseModel } from './buildExpenseModel'
import { ExpensesApp, ExpensesAppView } from './ExpensesApp'
import { ToastProvider } from './hooks/ToastProvider'
import type { ExpenseData } from './useExpenseData'

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

afterEach(() => {
  window.localStorage.removeItem(LEDGER_MODE_KEY)
})

const dataset = syntheticLedger({ months: 8, perMonth: 8, seed: 6 })
const months = [...new Set(dataset.transactions.map((t) => t.budgetMonth))].sort()

function servingSource() {
  const parts = memorySource(dataset)
  return Object.assign(parts, { canWrite: false, load: vi.fn().mockResolvedValue(dataset) }) as typeof parts & ExpenseDataSource & { load: ReturnType<typeof vi.fn> }
}

const app = (source: ExpenseDataSource) => (
  <ToastProvider>
    <ExpensesApp source={source} hubGrants={allGroupsGranted()} />
  </ToastProvider>
)

describe('ExpensesApp, which way it reads', () => {
  it('reads the whole dataset, and no part, unless this browser asked otherwise', async () => {
    const source = servingSource()
    render(app(source))
    await screen.findByText('Recent activity')
    expect(source.load).toHaveBeenCalledTimes(1)
    expect(source.calls).toEqual([])
  })

  it('reads the ledger in parts, and not the dataset, when this browser asked for it', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    const source = servingSource()
    render(app(source))
    await screen.findByText('Recent activity')
    expect(source.load).not.toHaveBeenCalled()
    expect(source.calls[0]).toBe('reference')
  })

  it('turns off again when the address says off', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    window.history.replaceState(null, '', '/?ledger=off')
    const source = servingSource()
    render(app(source))
    await screen.findByText('Recent activity')
    window.history.replaceState(null, '', '/')
    expect(source.load).toHaveBeenCalledTimes(1)
    expect(source.calls).toEqual([])
  })
})

describe('ExpensesAppView, a model that holds only the months looked at', () => {
  function data(over: Partial<ExpenseData> = {}): ExpenseData {
    return {
      status: 'ready',
      model: buildExpenseModel(dataset),
      refreshing: false,
      refreshOutcome: null,
      reload: vi.fn(),
      applyPatch: vi.fn(),
      ...over,
    }
  }

  const view = (d: ExpenseData) => (
    <ToastProvider>
      <ExpensesAppView source={{ canWrite: false, load: vi.fn() }} hubGrants={allGroupsGranted()} data={d} />
    </ToastProvider>
  )

  it('tells the model which month is shown, and again when the month changes', async () => {
    const viewMonth = vi.fn()
    render(view(data({ viewMonth })))
    await screen.findByText('Recent activity')
    expect(viewMonth).toHaveBeenLastCalledWith(months.at(-1))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(viewMonth).toHaveBeenLastCalledWith(months.at(-2)))
  })

  it('says so, and leaves what is shown unpressable, while the rows of the month are read', async () => {
    render(view(data({ viewMonth: vi.fn(), hydrating: true })))
    const status = await screen.findByRole('status', { name: '' })
    expect(status).toHaveTextContent(/^Loading .*20\d\d…$/)
    expect(status.parentElement).toHaveAttribute('aria-busy', 'true')
  })

  it('shows no loading state when nothing is being read', async () => {
    render(view(data({ viewMonth: vi.fn(), hydrating: false })))
    await screen.findByText('Recent activity')
    expect(screen.queryByText(/^Loading .*…$/)).toBeNull()
  })
})
