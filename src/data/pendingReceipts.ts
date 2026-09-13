/**
 * Receipts chosen before their transaction exists.
 *
 * Each staged file carries the blob URL its preview renders from. The URL is
 * minted here, called from the file-input change handler — a plain event
 * handler is the right home for that side effect. Creating them in render is
 * unsound, and creating them in an effect means writing state from an effect,
 * which cascades renders; both were tried and both were wrong.
 *
 * Every URL pins its blob in memory until revoked, so staging a few phone
 * photos and abandoning the form leaks megabytes unless `revokeStaged` runs on
 * removal and on unmount.
 */
export interface PendingReceipt {
  file: File
  /** Blob URL for the preview. Empty when the environment has no createObjectURL. */
  url: string
}

/** Mint a preview URL per file. Order is preserved. */
export function stageReceipts(files: File[]): PendingReceipt[] {
  return files.map((file) => ({
    file,
    // Guarded rather than assumed: jsdom has no createObjectURL by default, and
    // a missing preview should degrade to a blank tile, not throw on staging.
    url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
  }))
}

/** Release the blobs behind these previews. Safe to call twice. */
export function revokeStaged(items: PendingReceipt[]): void {
  if (typeof URL.revokeObjectURL !== 'function') return
  for (const item of items) {
    if (item.url) URL.revokeObjectURL(item.url)
  }
}

/** Drop one staged receipt by index, revoking just its blob. */
export function removeStaged(items: PendingReceipt[], index: number): PendingReceipt[] {
  const target = items[index]
  if (!target) return items
  revokeStaged([target])
  return items.filter((_, i) => i !== index)
}
