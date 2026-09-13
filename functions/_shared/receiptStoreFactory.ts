import type { ReceiptStore } from '../domain/ports/receiptStore'
import { createR2ReceiptStore } from './adapters/r2ReceiptStore'
import type { Env } from './env'

/**
 * The receipt store, or null when the bucket is not bound.
 *
 * Null is a normal state, not an error: RECEIPTS is optional, and every caller
 * that only *cleans up* bytes can skip the work entirely. Routes that need to
 * read or write bytes check for null themselves and answer 503.
 */
export function receiptStore(env: Env): ReceiptStore | null {
  return env.RECEIPTS ? createR2ReceiptStore(env.RECEIPTS) : null
}
