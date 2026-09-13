import type { ReceiptStore } from '../../domain/ports/receiptStore'

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
      if (keys.length > 0) await bucket.delete(keys)
    },
  }
}
