/**
 * What the browser keeps of a ledger so that it can be shown without the network. One record per signed-in
 * owner, under a key that names them, and only the current owner's: saving removes every other owner's, so a
 * second person on the same browser never opens the first one's figures, and a snapshot of someone else's is
 * discarded when it is found. A snapshot written by a build that read the dataset differently (`SNAPSHOT_VERSION`
 * moves whenever the dataset gains a required field) or in another ledger format is discarded too: reading it
 * could throw while the model is built, which costs the whole session where discarding costs one request.
 *
 * Saving is best effort and never throws: a full disk or a browser that refuses storage must not turn a load
 * that worked into one that failed.
 */
import type { AttachmentCounts, ReferenceTables } from '../domain/data/ledgerParts'
import type { MonthCell } from '../domain/ledger'
import type { Transaction, TransactionAttachment } from '../domain/types'
import type { HeldLedger } from './ledgerHold'
import { SNAPSHOT_VERSION, withStore } from './offlineCache'

/** Moves whenever the shape of `StoredLedger` does. */
export const LEDGER_SNAPSHOT_FORMAT = 1

const KEY_PREFIX = 'ledger:'

/** A `HeldLedger` as plain data: the maps are lists, which IndexedDB stores and structured clone copies. */
interface StoredLedger {
  revision: string | null
  reference: ReferenceTables
  pinned: Transaction[]
  months: string[]
  rowsPerMonth: Record<string, number>
  rowCount: number
  attachmentCounts: AttachmentCounts
  cells: MonthCell[] | null
  rows: Array<[string, Transaction[]]>
  receipts: Array<[number, TransactionAttachment[]]>
}

interface LedgerSnapshotRecord {
  key: string
  version: number
  format: number
  owner: string
  savedAt: string
  viewed: string
  ledger: StoredLedger
}

export interface LedgerSnapshot {
  held: HeldLedger
  viewed: string
  savedAt: string
}

const keyFor = (owner: string): string => `${KEY_PREFIX}${owner}`

const isList = (value: unknown): value is unknown[] => Array.isArray(value)
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function hasLedgerShape(ledger: unknown): ledger is StoredLedger {
  return (
    isObject(ledger) &&
    isObject(ledger.reference) &&
    isList(ledger.pinned) &&
    isList(ledger.months) &&
    isObject(ledger.rowsPerMonth) &&
    typeof ledger.rowCount === 'number' &&
    isObject(ledger.attachmentCounts) &&
    (ledger.cells === null || isList(ledger.cells)) &&
    isList(ledger.rows) &&
    isList(ledger.receipts)
  )
}

/** Pure, so that it can be tested without an IndexedDB: whether `record` is a snapshot this build can open for `owner`. */
export function isUsableLedgerSnapshot(record: unknown, owner: string): record is LedgerSnapshotRecord {
  if (!isObject(record) || record.version !== SNAPSHOT_VERSION || record.format !== LEDGER_SNAPSHOT_FORMAT) return false
  if (record.owner !== owner || record.key !== keyFor(owner)) return false
  return typeof record.viewed === 'string' && typeof record.savedAt === 'string' && hasLedgerShape(record.ledger)
}

function storedOf(held: HeldLedger): StoredLedger {
  return {
    revision: held.revision,
    reference: held.reference,
    pinned: held.pinned,
    months: held.months,
    rowsPerMonth: held.rowsPerMonth,
    rowCount: held.rowCount,
    attachmentCounts: held.attachmentCounts,
    cells: held.cells,
    rows: [...held.rows].map(([month, list]) => [month, [...list]]),
    receipts: [...held.receipts].map(([id, list]) => [id, [...list]]),
  }
}

function heldOf(stored: StoredLedger): HeldLedger {
  return {
    ...stored,
    rows: new Map(stored.rows),
    receipts: new Map(stored.receipts),
  }
}

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })

/** Keeps `held` as `owner`'s snapshot and removes every other owner's. Resolves false when it could not. */
export async function saveLedgerSnapshot(owner: string, held: HeldLedger, viewed: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false
  const record: LedgerSnapshotRecord = {
    key: keyFor(owner),
    version: SNAPSHOT_VERSION,
    format: LEDGER_SNAPSHOT_FORMAT,
    owner,
    savedAt: new Date().toISOString(),
    viewed,
    ledger: storedOf(held),
  }
  try {
    await withStore('readwrite', async (store) => {
      const keys = await done(store.getAllKeys())
      for (const key of keys) {
        if (typeof key === 'string' && key.startsWith(KEY_PREFIX) && key !== record.key) await done(store.delete(key))
      }
      await done(store.put(record))
    })
    return true
  } catch {
    return false
  }
}

/** `owner`'s snapshot, or null when there is none or it is not one this build can open (which is removed). */
export async function loadLedgerSnapshot(owner: string): Promise<LedgerSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    return await withStore('readwrite', async (store) => {
      const record: unknown = await done(store.get(keyFor(owner)))
      if (record === undefined) return null
      if (!isUsableLedgerSnapshot(record, owner)) {
        await done(store.delete(keyFor(owner)))
        return null
      }
      return { held: heldOf(record.ledger), viewed: record.viewed, savedAt: record.savedAt }
    })
  } catch {
    return null
  }
}

/** Removes `owner`'s snapshot, for a server that has said they may not read it. Never throws: it is a clean-up. */
export async function forgetLedgerSnapshot(owner: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await withStore('readwrite', (store) => done(store.delete(keyFor(owner))))
  } catch {
    /* a store that cannot be written cannot be cleared either */
  }
}
