export interface BackupObjectMeta {
  key: string
  size: number
}

/** Object storage port for scheduled JSON snapshots (R2, S3, local disk, …). */
export interface BackupStore {
  put(key: string, body: string, contentType?: string): Promise<void>
  list(prefix?: string): Promise<BackupObjectMeta[]>
  delete(key: string): Promise<void>
}
