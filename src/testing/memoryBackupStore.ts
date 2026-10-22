import type { BackupObjectMeta, BackupStore } from '../domain/ports/backupStore'

/** A bucket held in memory, standing in for R2, that counts what is asked of it and can be made to fail. */
export interface MemoryBackupStore extends BackupStore {
  objects: Map<string, string>
  /** Every call made since the last reset, by kind. */
  calls: { put: number; get: number; list: number; delete: number }
  /** Calls of every kind since the last reset. */
  total(): number
  resetCalls(): void
  /**
   * Make the call after this many more calls throw, as an invocation killed part way does. The call that is
   * killed does not happen. Pass null to let calls through again.
   */
  killAfter(calls: number | null): void
}

export function memoryBackupStore(initial: Record<string, string> = {}): MemoryBackupStore {
  const objects = new Map<string, string>(Object.entries(initial))
  const calls = { put: 0, get: 0, list: 0, delete: 0 }
  let remaining: number | null = null

  const gate = (kind: keyof typeof calls): void => {
    if (remaining !== null) {
      if (remaining <= 0) throw new Error('killed: the invocation ended here')
      remaining -= 1
    }
    calls[kind] += 1
  }

  return {
    objects,
    calls,
    total: () => calls.put + calls.get + calls.list + calls.delete,
    resetCalls: () => {
      calls.put = 0
      calls.get = 0
      calls.list = 0
      calls.delete = 0
    },
    killAfter: (count) => {
      remaining = count
    },
    put: (key, body) => {
      gate('put')
      objects.set(key, body)
      return Promise.resolve()
    },
    get: (key) => {
      gate('get')
      return Promise.resolve(objects.get(key) ?? null)
    },
    list: (prefix) => {
      gate('list')
      const found: BackupObjectMeta[] = [...objects]
        .filter(([key]) => prefix === undefined || key.startsWith(prefix))
        .map(([key, body]) => ({ key, size: body.length }))
      return Promise.resolve(found)
    },
    delete: (key) => {
      gate('delete')
      objects.delete(key)
      return Promise.resolve()
    },
    deleteMany: (keys) => {
      gate('delete')
      for (const key of keys) objects.delete(key)
      return Promise.resolve()
    },
  }
}
