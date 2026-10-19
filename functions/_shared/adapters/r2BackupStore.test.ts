import { describe, expect, it } from 'vitest'
import { createR2BackupStore } from './r2BackupStore'

describe('the R2 adapter', () => {
  function r2() {
    const calls = { delete: [] as Array<string | string[]> }
    const objects = new Map<string, string>([['k', 'text']])
    const binding = {
      put: (key: string, body: string) => {
        objects.set(key, body)
        return Promise.resolve()
      },
      get: (key: string) => Promise.resolve(objects.has(key) ? { text: () => Promise.resolve(objects.get(key)!) } : null),
      delete: (keys: string | string[]) => {
        calls.delete.push(keys)
        return Promise.resolve()
      },
      list: () => Promise.resolve({ objects: [], truncated: false }),
    } as unknown as R2Bucket
    return { store: createR2BackupStore(binding), calls }
  }

  it('reads an object’s text, and null for one that is not there', async () => {
    const { store } = r2()

    expect(await store.get('k')).toBe('text')
    expect(await store.get('absent')).toBeNull()
  })

  it('deletes many objects in calls of at most a thousand keys', async () => {
    const { store, calls } = r2()
    const keys = Array.from({ length: 2_500 }, (_, i) => `key-${i}`)

    await store.deleteMany!(keys)

    expect(calls.delete.map((k) => (k as string[]).length)).toEqual([1_000, 1_000, 500])
  })
})
