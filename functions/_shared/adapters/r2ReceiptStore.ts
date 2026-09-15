import type { ReceiptStore } from '../../domain/ports/receiptStore'

// R2 rejects the whole call above this, not just the excess — and the revoke sweep
// swallows errors, so an unchunked call would delete nothing, silently.
const R2_DELETE_LIMIT = 1000

/** Cloudflare R2 adapter for {@link ReceiptStore}. */
export function createR2ReceiptStore(bucket: R2Bucket): ReceiptStore {
  return {
    put: async (key, body, contentType) => {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    get: async (key) => {
      const object = await bucket.get(key)
      if (!object) return null
      return { body: object.body, size: object.size, etag: object.httpEtag }
    },
    deleteMany: async (keys) => {
      for (let i = 0; i < keys.length; i += R2_DELETE_LIMIT) {
        await bucket.delete(keys.slice(i, i + R2_DELETE_LIMIT))
      }
    },
  }
}
