/**
 * Just enough of IndexedDB for code that opens one database, creates a store in `onupgradeneeded` and reads
 * and writes it in transactions: `get`, `put`, `delete` and `getAllKeys`, with values copied the way the real
 * one copies them. Requests answer on a later tick and a transaction completes once its requests have, so code
 * that depends on the order of events behaves as it does in a browser. `failNext` makes the next call to a
 * method fail, for the paths that must survive a full disk or a blocked store.
 */
type Entries = Map<IDBValidKey, unknown>

export interface FakeIndexedDb {
  /** The stores of the database, by name, as plain maps, for a test to look at or seed. */
  stores: Map<string, Entries>
  failNext(method: 'get' | 'put' | 'delete' | 'getAllKeys', error?: Error): void
  uninstall(): void
}

export function installFakeIndexedDb(): FakeIndexedDb {
  const stores = new Map<string, Entries>()
  const failures = new Map<string, Error>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')

  function request<T>(method: string, pending: { n: number }, run: () => T): IDBRequest<T> {
    const req = { result: undefined as T, error: null as Error | null, onsuccess: null as null | (() => void), onerror: null as null | (() => void) }
    pending.n += 1
    setTimeout(() => {
      const failure = failures.get(method)
      failures.delete(method)
      try {
        if (failure) throw failure
        req.result = run()
        req.onsuccess?.()
      } catch (error) {
        req.error = error as Error
        req.onerror?.()
      }
      pending.n -= 1
    }, 0)
    return req as unknown as IDBRequest<T>
  }

  function storeApi(name: string, pending: { n: number }): IDBObjectStore {
    const entries = stores.get(name)!
    return {
      get: (key: IDBValidKey) => request('get', pending, () => structuredClone(entries.get(key))),
      put: (value: { key: IDBValidKey }) => request('put', pending, () => (entries.set(value.key, structuredClone(value)), value.key)),
      delete: (key: IDBValidKey) => request('delete', pending, () => void entries.delete(key)),
      getAllKeys: () => request('getAllKeys', pending, () => [...entries.keys()]),
    } as unknown as IDBObjectStore
  }

  const db = {
    createObjectStore: (name: string) => void stores.set(name, new Map()),
    close: () => undefined,
    transaction(name: string) {
      const pending = { n: 0 }
      const tx = { oncomplete: null as null | (() => void), onerror: null as null | (() => void), error: null as Error | null, objectStore: () => storeApi(name, pending) }
      const settle = () => {
        if (pending.n > 0) return void setTimeout(settle, 0)
        tx.oncomplete?.()
      }
      setTimeout(settle, 1)
      return tx
    },
  }

  const factory = {
    open() {
      const req = { result: db, error: null, onsuccess: null as null | (() => void), onupgradeneeded: null as null | (() => void), onerror: null }
      setTimeout(() => {
        if (stores.size === 0) req.onupgradeneeded?.()
        req.onsuccess?.()
      }, 0)
      return req
    },
  }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })

  return {
    stores,
    failNext: (method, error = new Error(`${method} failed`)) => void failures.set(method, error),
    uninstall: () => {
      if (original) Object.defineProperty(globalThis, 'indexedDB', original)
      else Reflect.deleteProperty(globalThis, 'indexedDB')
    },
  }
}
