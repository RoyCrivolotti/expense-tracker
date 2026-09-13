/**
 * R2 key scheme for receipts.
 *
 * Owner-prefixed like `ownerBackupKey`, so revoking a user is a prefix sweep.
 * Content-addressed on the stored bytes, so re-uploading the same photo is
 * idempotent rather than paying for a second copy.
 *
 * Critically, a key contains **no user-supplied string** — not the filename, not
 * anything from the request. That is what makes path traversal impossible by
 * construction rather than by escaping. The client never supplies a key either:
 * the serve route resolves id -> row -> object_key, scoped by owner.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function receiptKey(owner: string, transactionId: number, hash: string, ext: string): string {
  return `${owner}/${transactionId}/${hash}.${ext}`
}

export function receiptThumbKey(
  owner: string,
  transactionId: number,
  hash: string,
): string {
  return `${owner}/${transactionId}/${hash}_thumb.jpg`
}

/** Every object belonging to one owner, for revoke cleanup. */
export function ownerReceiptPrefix(owner: string): string {
  return `${owner}/`
}
