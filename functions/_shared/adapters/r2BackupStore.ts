import type { BackupObjectMeta, BackupStore } from '../../domain/ports/backupStore'

/** Cloudflare R2 adapter for {@link BackupStore}. */
export function createR2BackupStore(bucket: R2Bucket): BackupStore {
  return {
    put: async (key, body, contentType = 'application/json') => {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    list: (prefix) => listAll(bucket, prefix),
    delete: (key) => bucket.delete(key),
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
