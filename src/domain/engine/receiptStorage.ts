import type { TransactionAttachment } from '../types'

export interface ReceiptStorageUsage {
  /** How many receipts are stored, across every transaction. */
  count: number
  usedBytes: number
  limitBytes: number
  /** used / limit, clamped to 0..1 so a raised-then-lowered cap cannot overflow a bar. */
  ratio: number
}

/**
 * What the receipts bucket is holding, for the owner looking at Settings.
 *
 * Needs no endpoint of its own. `byteSize` is written as
 * `fileBytes + thumbBytes.length` (`receiptService.ts`) and the server enforces
 * the quota with `SELECT SUM(byte_size)` (`dbAttachments.ts`), so summing the
 * attachments already in the dataset reproduces the server's own figure exactly
 * rather than approximating it.
 *
 * `limitBytes` is the *default* from `config/receipt-policy.json`. A deployment
 * that sets `RECEIPT_MAX_OWNER_BYTES` overrides it server-side only, so the bar
 * would then be drawn against the wrong ceiling — the enforcement is unaffected
 * either way, and the rejection message states the real limit.
 */
export function computeReceiptStorage(
  attachments: TransactionAttachment[],
  limitBytes: number,
): ReceiptStorageUsage {
  const usedBytes = attachments.reduce((sum, a) => sum + a.byteSize, 0)
  const ratio = limitBytes > 0 ? Math.min(1, Math.max(0, usedBytes / limitBytes)) : 0
  return { count: attachments.length, usedBytes, limitBytes, ratio }
}

/**
 * Decimal units, matching how Cloudflare bills and reports R2.
 *
 * Separate from `formatMb` in `receiptRules.ts` on purpose: that one rounds MB
 * to whole numbers because it renders *limits* ("must be 5 MB or smaller"),
 * where a decimal reads as false precision. This renders a running total, where
 * rounding 800 KB to "1 MB" — or to "0 MB" — is the useless answer.
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}
