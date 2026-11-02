import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultExpenseSettings } from '../engine'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import type { ExpenseDataset } from '../types'
import { LEDGER_KEY_PREFIX, SNAPSHOT_VERSION, saveOfflineSnapshot, withStore } from './offlineCache'
import { forgetSavedCopies, savedCopyOwner } from './savedCopy'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'

const dataset = (): ExpenseDataset => ({
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
  settings: defaultExpenseSettings(),
})

let fake: FakeIndexedDb

beforeEach(() => {
  fake = installFakeIndexedDb()
})
afterEach(() => {
  fake.uninstall()
  vi.unstubAllGlobals()
})

/** Puts a record in the store as it is, for the shapes a test needs that the app's own writers would not make. */
const put = (record: Record<string, unknown>) =>
  withStore(
    'readwrite',
    (store) =>
      new Promise<void>((resolve, reject) => {
        const request = store.put(record)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error ?? new Error('put failed'))
      }),
  )

/** A ledger's copy as far as these functions read one: the key, the version and the owner. */
const putLedgerCopy = (owner: string, version = SNAPSHOT_VERSION) =>
  put({ key: `${LEDGER_KEY_PREFIX}${owner}`, version, owner })

const keys = () => [...(fake.stores.get('snapshots')?.keys() ?? [])]

describe('whose copy this device keeps', () => {
  it('is no one’s when nothing was saved', async () => {
    expect(await savedCopyOwner(true)).toBeNull()
    expect(await savedCopyOwner(false)).toBeNull()
  })

  it('is the owner of the dataset copy', async () => {
    await saveOfflineSnapshot(ALICE, dataset())

    expect(await savedCopyOwner(false)).toBe(ALICE)
    expect(await savedCopyOwner(true)).toBe(ALICE)
  })

  it('is no one’s for a copy this build cannot open, or one that names no one', async () => {
    await put({ key: 'latest', version: SNAPSHOT_VERSION - 1, owner: ALICE })
    expect(await savedCopyOwner(false)).toBeNull()

    await put({ key: 'latest', version: SNAPSHOT_VERSION })
    expect(await savedCopyOwner(false)).toBeNull()
  })

  it('counts a ledger’s copy only for a browser that reads the ledger in parts', async () => {
    await putLedgerCopy(ALICE)

    expect(await savedCopyOwner(true)).toBe(ALICE)
    expect(await savedCopyOwner(false)).toBeNull()
  })

  it('ignores a ledger copy this build cannot open', async () => {
    await putLedgerCopy(ALICE, SNAPSHOT_VERSION - 1)

    expect(await savedCopyOwner(true)).toBeNull()
  })

  it('is the same person when both kinds of copy are theirs', async () => {
    await saveOfflineSnapshot(ALICE, dataset())
    await putLedgerCopy(ALICE)

    expect(await savedCopyOwner(true)).toBe(ALICE)
  })

  it('is no one’s when the copies name two people, since nothing here says which is holding the phone', async () => {
    await saveOfflineSnapshot(ALICE, dataset())
    await putLedgerCopy(BOB)

    expect(await savedCopyOwner(true)).toBeNull()
    expect(await savedCopyOwner(false)).toBe(ALICE)
  })

  it('is no one’s where the browser keeps no database, or the store cannot be read', async () => {
    await saveOfflineSnapshot(ALICE, dataset())
    fake.failNext('get')
    expect(await savedCopyOwner(false)).toBeNull()

    vi.stubGlobal('indexedDB', undefined)
    expect(await savedCopyOwner(false)).toBeNull()
  })
})

describe('forgetting the copies', () => {
  it('removes the dataset copy and every ledger copy', async () => {
    await saveOfflineSnapshot(ALICE, dataset())
    await putLedgerCopy(ALICE)
    await putLedgerCopy(BOB)

    await forgetSavedCopies()

    expect(keys()).toEqual([])
    expect(await savedCopyOwner(true)).toBeNull()
  })

  it('has nothing to do for an empty store, and never throws', async () => {
    await expect(forgetSavedCopies()).resolves.toBeUndefined()

    await saveOfflineSnapshot(ALICE, dataset())
    fake.failNext('delete')
    await expect(forgetSavedCopies()).resolves.toBeUndefined()

    vi.stubGlobal('indexedDB', undefined)
    await expect(forgetSavedCopies()).resolves.toBeUndefined()
  })
})
