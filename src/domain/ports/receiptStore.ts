export interface ReceiptObject {
  /** Streamed straight to the response — the Worker never buffers the bytes. */
  body: ReadableStream
  size: number
  etag: string
}

/**
 * Object storage port for receipt bytes (R2, S3, local disk, …).
 *
 * Deliberately separate from {@link BackupStore}: they have different
 * lifecycles, different buckets and different failure modes — a receipts bucket
 * that is missing must not stop the daily backup, and vice versa.
 */
export interface ReceiptStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<ReceiptObject | null>
  /** Best-effort: R2 deletes cannot join a D1 batch, so callers delete rows first. */
  deleteMany(keys: string[]): Promise<void>
}
