/**
 * Whose copy this device keeps for when the network does not answer, and getting rid of it. It reads the keys of
 * the store and not the ledger's snapshot module, which only a browser that turned the ledger on loads, and it is
 * loaded only when the access check has failed, so the sign-in path of a browser that is online carries none of it.
 */
import { LEDGER_KEY_PREFIX, SNAPSHOT_VERSION, readSnapshot, withStore } from './offlineCache'

const ask = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })

/** A store that has not answered by now is not going to, and the person is waiting on a screen that has nothing else to say. */
const LOOK_UP_MS = 3000

interface Named {
  version?: number
  owner?: string
}

/**
 * The person the saved copy is for, or null when there is none this build can open. `withLedger` says whether a
 * ledger's copies count, which they do only in a browser that reads the ledger in parts. Copies that name more than
 * one person (two people used this browser, one with each way of reading) name no one: nothing here can say which of
 * them is holding the phone. A store that does not answer within a few seconds counts as holding nothing.
 */
export async function savedCopyOwner(withLedger: boolean): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const giveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOOK_UP_MS)
  })
  try {
    return await Promise.race([lookUp(withLedger), giveUp])
  } finally {
    clearTimeout(timer)
  }
}

async function lookUp(withLedger: boolean): Promise<string | null> {
  try {
    const owners = await withStore('readonly', async (store) => {
      const found = new Set<string>()
      const note = (record: Named | undefined) => {
        if (record?.version === SNAPSHOT_VERSION && record.owner) found.add(record.owner)
      }
      note(await readSnapshot(store))
      if (withLedger) {
        for (const key of await ask(store.getAllKeys())) {
          if (typeof key === 'string' && key.startsWith(LEDGER_KEY_PREFIX)) note((await ask(store.get(key))) as Named | undefined)
        }
      }
      return found
    })
    return owners.size === 1 ? ([...owners][0] ?? null) : null
  } catch {
    return null
  }
}

/** Removes every copy, for a server that has said the person may not read it. The store holds nothing else. Never throws. */
export async function forgetSavedCopies(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await withStore('readwrite', async (store) => {
      for (const key of await ask(store.getAllKeys())) await ask(store.delete(key))
    })
  } catch {
    /* a store that cannot be written cannot be cleared either; a copy is still refused to anyone it is not for */
  }
}
