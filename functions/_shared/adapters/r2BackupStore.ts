import type { BackupObjectMeta, BackupStore } from '../../domain/ports/backupStore'

/** Cloudflare R2 adapter for {@link BackupStore}. */
export function createR2BackupStore(bucket: R2Bucket): BackupStore {
  return {
    put: async (key, body, contentType = 'application/json') => {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    get: async (key) => {
      const object = await bucket.get(key)
      return object ? object.text() : null
    },
    list: (prefix) => listAll(bucket, prefix),
    delete: (key) => bucket.delete(key),
    // R2 deletes up to 1,000 keys in one call.
    deleteMany: async (keys) => {
      for (let i = 0; i < keys.length; i += 1_000) await bucket.delete(keys.slice(i, i + 1_000))
    },
  }
}

async function listAll(bucket: R2Bucket, prefix?: string): Promise<BackupObjectMeta[]> {
  const objects: BackupObjectMeta[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list(
      cursor ? (prefix ? { prefix, cursor } : { cursor }) : prefix ? { prefix } : {},
    )
    for (const obj of page.objects) {
      objects.push({ key: obj.key, size: obj.size })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return objects
}
