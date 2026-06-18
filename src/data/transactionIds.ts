/** Max ids per bulk-delete request (guards against accidental huge payloads). */
export const MAX_BULK_DELETE = 500

/** Validate and dedupe transaction ids for bulk delete. Throws on invalid input. */
export function parseDeleteTransactionIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) throw new Error('ids must be an array')
  if (raw.length === 0) throw new Error('ids must not be empty')
  if (raw.length > MAX_BULK_DELETE) {
    throw new Error(`Too many ids (max ${MAX_BULK_DELETE})`)
  }
  const ids = [
    ...new Set(
      raw.map((value) => {
        const id = Number(value)
        if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid transaction id')
        return id
      }),
    ),
  ]
  return ids
}
