import { describe, expect, it, vi } from 'vitest'
import { createR2ReceiptStore } from './r2ReceiptStore'

function bucketSpy() {
  const calls: string[][] = []
  const bucket = {
    delete: vi.fn(async (keys: string[]) => {
      calls.push(keys)
    }),
  } as unknown as R2Bucket
  return { bucket, calls }
}

describe('createR2ReceiptStore.deleteMany', () => {
  it('does not call R2 for an empty key list', async () => {
    const { bucket, calls } = bucketSpy()

    await createR2ReceiptStore(bucket).deleteMany([])

    expect(calls).toEqual([])
  })

  it('sends a short list in one call', async () => {
    const { bucket, calls } = bucketSpy()

    await createR2ReceiptStore(bucket).deleteMany(['a', 'b', 'c'])

    expect(calls).toEqual([['a', 'b', 'c']])
  })

  it('chunks past R2 1000-key limit rather than losing the whole call', async () => {
    const { bucket, calls } = bucketSpy()
    const keys = Array.from({ length: 2001 }, (_, i) => `k${i}`)

    await createR2ReceiptStore(bucket).deleteMany(keys)

    // R2 rejects the *entire* call over 1000 keys, and the owner-wide revoke sweep
    // swallows errors — unchunked, a heavy user's receipts would silently survive.
    expect(calls.map((c) => c.length)).toEqual([1000, 1000, 1])
    expect(calls.flat()).toEqual(keys)
  })
})
