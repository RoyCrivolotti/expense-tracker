import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../../config/ledgerMode'
import type { ExpenseDataSource } from '../../data/dataSource'
import { allGroupsGranted } from '../../domain/accessGroups'
import { defaultExpenseSettings } from '../../engine'
import { makeDataset, makeTransaction } from '../../testing/factories'
import type { ExpenseDataset, ExpenseSettings } from '../../types'
import { ExpensesApp } from '../ExpensesApp'
import { ToastProvider } from '../hooks/ToastProvider'

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
/** Shared by the tests that open the whole app on a source whose settings one account keeps, as every device of theirs reads them. */

// These test the whole-dataset app, which a browser asks for with `?ledger=off`.
beforeEach(() => {
  // What a person skipped on this browser must not leak into the next test.
  localStorage.clear()
  localStorage.setItem(LEDGER_MODE_KEY, 'off')
})

export const SET_UP = {
  categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true }],
  accounts: [{ id: 1, name: 'Main debit', kind: 'debit' as const, settlement: 'immediate' as const, active: true }],
}

/** One account's saved settings, which every "device" that opens the app reads and writes. */
export interface Store {
  settings: ExpenseSettings
  failWrites: boolean
}

export const storeWith = (
  settings: Partial<ExpenseSettings> = {},
  failWrites = false,
): Store => ({
  settings: { ...defaultExpenseSettings(), ...settings },
  failWrites,
})

/** The settings writes a source has been asked for, kept apart from the source so a test can read them. */
export const written = new WeakMap<
  ExpenseDataSource,
  ReturnType<typeof vi.fn<(patch: Partial<ExpenseSettings>) => Promise<ExpenseSettings>>>
>()
export const writesOf = (source: ExpenseDataSource) => written.get(source)!

export function sourceFor(
  store: Store,
  transactions = [makeTransaction()],
  canWrite = true,
  flags: ExpenseDataset['flags'] = [],
): ExpenseDataSource {
  const dataset = (): ExpenseDataset => makeDataset({ ...SET_UP, transactions, flags, settings: store.settings })
  const update = vi.fn((patch: Partial<ExpenseSettings>) => {
    if (store.failWrites) return Promise.reject(new Error('offline'))
    store.settings = { ...store.settings, ...patch }
    return Promise.resolve(store.settings)
  })
  const source: ExpenseDataSource = { canWrite, load: () => Promise.resolve(dataset()), updateSettings: update }
  written.set(source, update)
  return source
}

export function open(
  source: ExpenseDataSource,
  accountEmail = 'one@example.com',
) {
  return render(
    <ToastProvider>
      <ExpensesApp source={source} hubGrants={allGroupsGranted()} accountEmail={accountEmail} />
    </ToastProvider>,
  )
}

export const card = () => screen.queryByRole('region', { name: 'Getting started' })
export const dashboardReady = () => screen.findByText('Budgets')
export const hide = () => fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
export async function settingsHelp() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!)
  fireEvent.click(await screen.findByRole('tab', { name: 'Setup' }))
}

/** An account with nothing in it yet, whose first run opens setup. */
export const emptySource = (store: Store): ExpenseDataSource => {
  const base = sourceFor(store, [])
  const source: ExpenseDataSource = {
    ...base,
    load: () => Promise.resolve(makeDataset({ settings: store.settings })),
    createCategory: vi
      .fn()
      .mockResolvedValue({ id: 1, name: 'Groceries', monthlyBudgetCents: 30000, sortOrder: 0, active: true }),
    createAccount: vi
      .fn()
      .mockResolvedValue({ id: 2, name: 'Main debit', kind: 'debit', settlement: 'immediate', active: true }),
  }
  written.set(source, writesOf(base))
  return source
}
