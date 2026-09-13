import policy from '../config/receipt-policy.json'
import type { ReceiptLimits } from '../domain/data/receiptRules'
import type { Env } from './env'

/**
 * Storage budget, mirroring backupPolicy.ts. The 2 GB owner cap is ~20% of R2's
 * 10 GB free tier, leaving room for the backups bucket (capped at 512 MB) and a
 * wide margin. At ~200 KB per downscaled receipt that is roughly 10,000 of them.
 *
 * Unlike backups — which run unattended at 04:00 and so need email alerts — this
 * quota is enforced synchronously at upload, so the feedback mechanism is a
 * clear rejection in the UI rather than a warning after the fact.
 */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function receiptLimits(env: Env): ReceiptLimits {
  return {
    maxFileBytes: parsePositiveInt(env.RECEIPT_MAX_FILE_BYTES, policy.maxFileBytes),
    maxPerTransaction: parsePositiveInt(env.RECEIPT_MAX_PER_TRANSACTION, policy.maxPerTransaction),
    maxOwnerBytes: parsePositiveInt(env.RECEIPT_MAX_OWNER_BYTES, policy.maxOwnerBytes),
  }
}

/** Client-side downscale targets, served to the UI so both agree on one source. */
export const imagePolicy = {
  maxImageEdgePx: policy.maxImageEdgePx,
  jpegQuality: policy.jpegQuality,
  thumbEdgePx: policy.thumbEdgePx,
} as const
