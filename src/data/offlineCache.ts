import type { ExpenseDataset } from '../types'

const DB_NAME = 'expense-tracker-offline'
const STORE = 'snapshots'
const SNAPSHOT_KEY = 'latest'

interface SnapshotRecord {
  key: string
  dataset: ExpenseDataset
  savedAt: string
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
    dataset,
    savedAt: new Date().toISOString(),
  }
  await withStore('readwrite', (store) => writeSnapshot(store, record))
}

export async function loadOfflineSnapshot(): Promise<{ dataset: ExpenseDataset; savedAt: string } | null> {
  if (typeof indexedDB === 'undefined') return null
  const record = await withStore('readonly', (store) => readSnapshot(store))
  if (!record) return null
  return { dataset: record.dataset, savedAt: record.savedAt }
}
