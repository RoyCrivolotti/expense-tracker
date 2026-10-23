import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LEDGER_MODE_KEY } from '../config/ledgerMode'
import type { ExpenseDataSource, NewTransaction } from '../data/dataSource'
import { allGroupsGranted } from '../domain/accessGroups'
import { EXPORT_CSV_HEADER } from '../domain/data/exportCsvFormat'
import { memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import type { Transaction } from '../types'
import { ExpensesApp } from './ExpensesApp'
import { ToastProvider } from './hooks/ToastProvider'

/**
 * The Settings import through the whole app: its second request is saved by the server and then the connection drops.
 * The notice says to look in Transactions, so the app must have read again what it shows, in the app that holds the
 * whole dataset and in the one that holds a ledger.
 */
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

const dataset = syntheticLedger({ months: 4, perMonth: 6, seed: 3 })
const category = dataset.categories[0]!.name
const account = dataset.accounts[0]!.name
const csv = [
  EXPORT_CSV_HEADER,
  ...Array.from({ length: 250 }, (_, i) => `,2026-01-05,2026-01,Import ${i + 1},${category},${account},expense,${100 + i},posted,0,`),
].join('\n')

/** A source whose second create is saved and then dropped. */
function droppingSource() {
  const parts = memorySource(dataset)
  let requests = 0
  const source = Object.assign(parts, {
    canWrite: true,
    load: vi.fn(() => Promise.resolve(parts.dataset)),
    createTransactions: (inputs: NewTransaction[]): Promise<Transaction[]> => {
      requests += 1
      const created = inputs.map((input, i) => ({ ...input, id: 90_000 + requests * 1_000 + i, status: 'posted' }) as Transaction)
      parts.dataset = { ...parts.dataset, transactions: [...parts.dataset.transactions, ...created] }
      return requests === 2 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(created)
    },
  })
  return source as typeof source & ExpenseDataSource
}

async function importWithSecondRequestDropped(source: ExpenseDataSource) {
  render(
    <ToastProvider>
      <ExpensesApp source={source} hubGrants={allGroupsGranted()} />
    </ToastProvider>,
  )
  await screen.findByText('Recent activity')
  fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!)
  fireEvent.click(await screen.findByRole('tab', { name: 'Data' }))
  const input = await waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(found).not.toBeNull()
    return found!
  })
  const file = new File([csv], 'import.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(csv) })
  await act(() => {
    fireEvent.change(input, { target: { files: [file] } })
    return Promise.resolve()
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
  expect(await screen.findByText(/may or may not have been saved \(Failed to fetch\)/)).toBeInTheDocument()
}

describe('ExpensesApp, an import whose second request is saved and then dropped', () => {
  it('reads the dataset again, in the app that holds all of it', async () => {
    const source = droppingSource()
    await importWithSecondRequestDropped(source)
    await waitFor(() => expect(source.load).toHaveBeenCalledTimes(2))
  })

  it('reads the ledger again, in the app that holds one', async () => {
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    const source = droppingSource()
    await importWithSecondRequestDropped(source)
    await waitFor(() => expect(source.calls.filter((call) => call === 'reference').length).toBeGreaterThan(1))
    expect(source.load).not.toHaveBeenCalled()
  })
})
