/**
 * The copy of the dataset the browser keeps for when the network does not answer is one person's: a load that
 * fails for someone else, or for the same person once the server has refused them, shows an error and not it.
 * The offline cache here is the real one over a fake IndexedDB.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../data/apiClient'
import type { ExpenseDataSource } from '../data/dataSource'
import { defaultExpenseSettings } from '../engine'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import type { ExpenseDataset } from '../types'
import { useExpenseData } from './useExpenseData'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'

const datasetWith = (openingCashCents: number): ExpenseDataset => ({
  flags: [],
  labels: [],
  attachments: [],
  categories: [],
  accounts: [],
  transactions: [],
  accountStatements: [],
  cashActuals: [],
  goalScenarios: [],
  installmentPlans: [],
  wealthAccounts: [],
  wealthCheckins: [],
  settings: { ...defaultExpenseSettings(), openingCashCents },
})

const loads = (dataset: ExpenseDataset): ExpenseDataSource => ({ canWrite: false, load: () => Promise.resolve(dataset) })
const fails = (error: Error): ExpenseDataSource => ({ canWrite: false, load: () => Promise.reject(error) })

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

let idb: FakeIndexedDb

beforeEach(() => {
  idb = installFakeIndexedDb()
  setOnline(true)
})
afterEach(() => {
  idb.uninstall()
  setOnline(true)
})

/** Opens the app's data as `owner` and waits until it has settled on a model or an error. */
async function open(source: ExpenseDataSource, owner?: string) {
  const view = renderHook(() => useExpenseData(source, owner))
  await waitFor(() => expect(view.result.current.status).not.toBe('loading'))
  view.unmount()
  return view.result.current
}

const saved = () => idb.stores.get('snapshots')?.get('latest') as { owner?: string } | undefined

describe('the saved copy of the dataset', () => {
  it('is shown to the person who saved it when their next load fails', async () => {
    await open(loads(datasetWith(12_345)), ALICE)

    const again = await open(fails(new Error('503 Service Unavailable')), ALICE)

    expect(again.status).toBe('ready')
    expect(again.fromCache).toBe(true)
    expect(again.model?.dataset.settings.openingCashCents).toBe(12_345)
  })

  it('is not shown to someone else whose load fails, and is dropped', async () => {
    await open(loads(datasetWith(12_345)), ALICE)

    const bob = await open(fails(new Error('503 Service Unavailable')), BOB)

    expect(bob.status).toBe('error')
    expect(bob.model).toBeUndefined()
    expect(saved()).toBeUndefined()
  })

  it('is not shown to someone else while the browser is offline either', async () => {
    await open(loads(datasetWith(12_345)), ALICE)
    setOnline(false)

    const bob = await open(loads(datasetWith(0)), BOB)

    expect(bob.status).toBe('error')
    expect(bob.model).toBeUndefined()
  })

  it('is replaced by the next person who loads, so it is only ever one person’s', async () => {
    await open(loads(datasetWith(12_345)), ALICE)
    await open(loads(datasetWith(777)), BOB)

    expect(saved()?.owner).toBe(BOB)
    const alice = await open(fails(new Error('503')), ALICE)
    expect(alice.status).toBe('error')
  })

  it('written by a build that did not name the owner is not shown to anyone, and is dropped', async () => {
    await open(loads(datasetWith(12_345)), ALICE)
    const record = saved() as Record<string, unknown>
    delete record.owner

    const alice = await open(fails(new Error('503')), ALICE)

    expect(alice.status).toBe('error')
    expect(saved()).toBeUndefined()
  })

  it.each([401, 403])('is not shown to the person it belongs to when the server answers %i', async (status) => {
    await open(loads(datasetWith(12_345)), ALICE)

    const refused = await open(fails(new ApiError('Refused', status)), ALICE)

    expect(refused.status).toBe('error')
    expect(refused.model).toBeUndefined()
    expect(saved()).toBeUndefined()
  })

  it('is neither kept nor shown when nobody is known to own it', async () => {
    await open(loads(datasetWith(12_345)))

    expect(saved()).toBeUndefined()
    const next = await open(fails(new Error('503')))
    expect(next.status).toBe('error')
  })
})
