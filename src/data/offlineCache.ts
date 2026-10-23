import type { ExpenseDataset } from '../types'

const DB_NAME = 'expense-tracker-offline'
const STORE = 'snapshots'
const SNAPSHOT_KEY = 'latest'

/**
 * Bump whenever `ExpenseDataset` gains a required field. A snapshot written by
 * an older build is missing that field, and the code reading it back — e.g.
 * `buildLookup`, which maps over every collection — would throw on `undefined`
 * and white-screen the app on the first load after a deploy. Discarding a
 * stale snapshot costs one network fetch; not discarding it costs the session.
 */
// Version 3 predates `labels`, which buildLookup now maps over. Version 4 predates
// `settings.goalLevers`, which the Goals page reads the length of. Version 5 predates
// `GoalScenario.contributionSchedule`, which every projection and the editor's draft read. Version 6
// predates `GoalScenario.homeCarryRate`, which Rent vs buy and the draft read. Version 7 predates
// `GoalScenario.retirementYears`, which the drawdown chart and the draft read. Version 8 predates
// `settings.marketVolatility`, which the spread card and the Assumptions card read.
export const SNAPSHOT_VERSION = 9

interface SnapshotRecord {
  key: string
  /** Absent on records written before versioning existed — treated as stale. */
  version?: number
  /** Whose dataset this is. Absent on records written before it was kept — treated as no one's. */
  owner?: string
  dataset: ExpenseDataset
  savedAt: string
}

/**
 * Whether `record` is a copy this build can open for `owner`. Pure so it can be tested without an IndexedDB
 * implementation. A copy is one person's: it is never shown to anyone else, nor when no owner is named.
 */
export function isCompatibleSnapshot(record: { version?: number; owner?: string } | undefined, owner: string): boolean {
  return record?.version === SNAPSHOT_VERSION && record.owner === owner
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function readSnapshot(store: IDBObjectStore): Promise<SnapshotRecord | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(SNAPSHOT_KEY)
    req.onsuccess = () => resolve(req.result as SnapshotRecord | undefined)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
  })
}

function removeSnapshot(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(SNAPSHOT_KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'))
  })
}

function writeSnapshot(store: IDBObjectStore, record: SnapshotRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB write failed'))
  })
}

export async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    fn(store).then(resolve, reject)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

export async function saveOfflineSnapshot(owner: string, dataset: ExpenseDataset): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const record: SnapshotRecord = {
    key: SNAPSHOT_KEY,
    version: SNAPSHOT_VERSION,
    owner,
    dataset,
    savedAt: new Date().toISOString(),
  }
  await withStore('readwrite', (store) => writeSnapshot(store, record))
}

/** `owner`'s copy, or null when there is none. One that is not theirs, or that this build cannot open, is removed. */
export async function loadOfflineSnapshot(owner: string): Promise<{ dataset: ExpenseDataset; savedAt: string } | null> {
  if (typeof indexedDB === 'undefined') return null
  return withStore('readwrite', async (store) => {
    const record = await readSnapshot(store)
    if (!record) return null
    if (!isCompatibleSnapshot(record, owner)) {
      await removeSnapshot(store)
      return null
    }
    return { dataset: record.dataset, savedAt: record.savedAt }
  })
}

/** Removes the copy, for a server that has said the person may not read it. Never throws: it is a clean-up. */
export async function forgetOfflineSnapshot(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await withStore('readwrite', (store) => removeSnapshot(store))
  } catch {
    /* a store that cannot be written cannot be cleared either; the copy is still refused to anyone it is not for */
  }
}
