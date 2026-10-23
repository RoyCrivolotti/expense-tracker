import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../data/apiClient'
import type { ExpenseDataSource, NewTransaction } from '../data/dataSource'
import { memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import type { ExpenseDataset, Transaction } from '../types'
import { ImportStopped, importInChunks } from './settings/importInChunks'
import { useExpenseActions } from './useExpenseActions'
import { useExpenseData } from './useExpenseData'
import { useLedgerData } from './useLedgerData'

/**
 * An import saves its rows in requests, and a request that fails may have been saved. What the screens show then is what
 * the app read last plus what each answered request put in, so the rows of the one that did not answer are missing from
 * the list until something reads again. These run the import through the real data hooks in both apps, over a server
 * that saves the second request and then drops the connection, or refuses it.
 */
const base = syntheticLedger({ months: 3, perMonth: 4, seed: 1 })
const template = base.transactions[0]!

const rows = (n: number): NewTransaction[] =>
  Array.from({ length: n }, (_, i) => ({
    date: template.date,
    budgetMonth: template.budgetMonth,
    description: `Import ${i + 1}`,
    accountId: template.accountId,
    categoryId: template.categoryId,
    type: 'expense',
    amountCents: 100 + i,
    cancelled: false,
  }))

type Failure = 'dropped' | 'refused'

/** A server holding `served.dataset`, whose second request is saved and then dropped, or refused and not saved. */
function server(served: { dataset: ExpenseDataset }, failure: Failure) {
  let requests = 0
  let nextId = 50_000
  return (inputs: NewTransaction[]): Promise<Transaction[]> => {
    requests += 1
    if (requests === 2 && failure === 'refused') return Promise.reject(new ApiError('Row 1: not allowed', 422))
    const created = inputs.map((input) => ({ ...input, id: (nextId += 1), status: 'posted' }) as Transaction)
    served.dataset = { ...served.dataset, transactions: [...served.dataset.transactions, ...created] }
    return requests === 2 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(created)
  }
}

async function importAll(actions: NonNullable<ReturnType<typeof useExpenseActions>>) {
  let stopped: unknown
  await act(async () => {
    await importInChunks(rows(5), actions.createTransactions, { size: 2 }).catch((error: unknown) => (stopped = error))
  })
  expect(stopped).toBeInstanceOf(ImportStopped)
  expect((stopped as ImportStopped).imported).toBe(2)
}

describe('an import whose second request fails, in the app that holds the whole dataset', () => {
  function started(failure: Failure) {
    const served = { dataset: base }
    const load = vi.fn(() => Promise.resolve(served.dataset))
    const source: ExpenseDataSource = { canWrite: true, load, createTransactions: server(served, failure) }
    const hook = renderHook(() => {
      const data = useExpenseData(source)
      return { data, actions: useExpenseActions(source, data.applyPatch, vi.fn(), false, data.reload) }
    })
    return { load, ...hook }
  }

  it('reads the dataset again when the request may have been saved, so the rows it saved are listed', async () => {
    const { result, load } = started('dropped')
    await waitFor(() => expect(result.current.data.status).toBe('ready'))
    await importAll(result.current.actions!)
    // The first request's two rows were patched in; the second request's two are only on the server.
    await waitFor(() => expect(result.current.data.model!.dataset.transactions).toHaveLength(base.transactions.length + 4))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not read again for a request the server refused, which saved nothing', async () => {
    const { result, load } = started('refused')
    await waitFor(() => expect(result.current.data.status).toBe('ready'))
    await importAll(result.current.actions!)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.data.model!.dataset.transactions).toHaveLength(base.transactions.length + 2)
  })
})

describe('an import whose second request fails, in the app that holds a ledger', () => {
  function started(failure: Failure) {
    const ledger = memorySource(base)
    const served = {
      get dataset() {
        return ledger.dataset
      },
      set dataset(next: ExpenseDataset) {
        ledger.dataset = next
      },
    }
    const writer: ExpenseDataSource = { canWrite: true, load: vi.fn(), createTransactions: server(served, failure) }
    const hook = renderHook(() => {
      const data = useLedgerData(ledger)
      return { data, actions: useExpenseActions(writer, data.applyPatch, vi.fn(), false, data.reload) }
    })
    return { ledger, ...hook }
  }

  it('reads the ledger again when the request may have been saved, so the rows it saved are listed', async () => {
    const { result } = started('dropped')
    await waitFor(() => expect(result.current.data.status).toBe('ready'))
    await importAll(result.current.actions!)
    await waitFor(() => expect(result.current.data.model!.dataset.transactions).toHaveLength(base.transactions.length + 4))
  })

  it('does not read the ledger again for a request the server refused', async () => {
    const { result, ledger } = started('refused')
    await waitFor(() => expect(result.current.data.status).toBe('ready'))
    const reads = ledger.calls.length
    await importAll(result.current.actions!)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(ledger.calls).toHaveLength(reads)
    expect(result.current.data.model!.dataset.transactions).toHaveLength(base.transactions.length + 2)
  })
})
