export interface BackupObjectMeta {
  key: string
  size: number
}

/** Object storage port for scheduled JSON snapshots (R2, S3, local disk, …). */
export interface BackupStore {
  put(key: string, body: string, contentType?: string): Promise<void>
  /** The object's text, or null when there is no such object. */
  get(key: string): Promise<string | null>
  list(prefix?: string): Promise<BackupObjectMeta[]>
  delete(key: string): Promise<void>
  /** Removes many objects in one call, for a store that can; pruning a chunked backup removes dozens. */
  deleteMany?(keys: string[]): Promise<void>
}
