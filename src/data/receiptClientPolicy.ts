/**
 * The slice of `config/receipt-policy.json` the browser needs.
 *
 * Duplicated rather than imported because `tsconfig.app.json` has no
 * `resolveJsonModule` — only the Functions build reads the JSON directly, via
 * `functions/_shared/receiptPolicy.ts`. **The server is authoritative**: these
 * values exist so the UI can shrink an image before uploading it and grey out
 * "Add receipt" at the cap, not to decide anything. Every limit is re-checked
 * server-side in `checkUpload`, and env overrides only apply there — so a
 * mismatch here shows up as a rejection with a clear message, never as an
 * unenforced limit.
 */
export const RECEIPT_CLIENT_POLICY = {
  maxEdge: 1600,
  maxBytes: 5_242_880,
  /** Below this, re-encoding costs more quality than it saves bytes. */
  skipUnderBytes: 300_000,
  thumbEdge: 320,
  maxPerTransaction: 4,
} as const
