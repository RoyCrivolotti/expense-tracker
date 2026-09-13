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
const SNAPSHOT_VERSION = 2

interface SnapshotRecord {
  key: string
  /** Absent on records written before versioning existed — treated as stale. */
  version?: number
  dataset: ExpenseDataset
  savedAt: string
}

/** Pure so it can be tested without an IndexedDB implementation. */
export function isCompatibleSnapshot(record: { version?: number } | undefined): boolean {
  return record?.version === SNAPSHOT_VERSION
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

function writeSnapshot(store: IDBObjectStore, record: SnapshotRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB write failed'))
  })
}

async function withStore<T>(
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

export async function saveOfflineSnapshot(dataset: ExpenseDataset): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const record: SnapshotRecord = {
    key: SNAPSHOT_KEY,
    version: SNAPSHOT_VERSION,
    dataset,
    savedAt: new Date().toISOString(),
  }
  await withStore('readwrite', (store) => writeSnapshot(store, record))
}

export async function loadOfflineSnapshot(): Promise<{ dataset: ExpenseDataset; savedAt: string } | null> {
  if (typeof indexedDB === 'undefined') return null
  const record = await withStore('readonly', (store) => readSnapshot(store))
  if (!record || !isCompatibleSnapshot(record)) return null
  return { dataset: record.dataset, savedAt: record.savedAt }
}
