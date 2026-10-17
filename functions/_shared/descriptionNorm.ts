import { normalizeDesc } from '../domain/engine/recurringDetect'

/**
 * What `transactions.description_norm` holds for a description: the same function the engines group
 * by in the browser, never SQL's `lower(trim(...))`, which differs for non-ASCII text and for any
 * whitespace but a space. Every statement that writes `description` writes this beside it.
 */
export const descriptionNorm = normalizeDesc

/**
 * The extra assignment an UPDATE needs when its patch sets `description`, in the same order as its
 * values, so the two paths that build their SET list from the patch's keys (one row, many rows) cannot
 * leave the column behind.
 */
export function descriptionNormSets(
  keys: readonly string[],
  patch: { description?: unknown },
): { sets: string[]; values: unknown[] } {
  if (!keys.includes('description')) return { sets: [], values: [] }
  const text = patch.description
  return { sets: ['description_norm = ?'], values: [typeof text === 'string' ? descriptionNorm(text) : null] }
}
