import type { Slot } from '../../../src/domain/capture/slots'

/**
 * How much of a push the database keeps, as the columns' checks allow. Apart from the store so that a Node script that
 * re-reads stored pushes (workers/capture/fix) can apply the same limits without loading the Worker.
 */
export const MAX_MERCHANT = 200
export const MAX_BODY = 500
const MAX_SLOTS_JSON = 2000

/**
 * The slots as JSON, keeping the longest run from the start that fits the column. Each slot is written once and the
 * lengths added up, so a body full of numbers costs one pass rather than one stringify per slot dropped.
 */
export function slotsJson(slots: readonly Slot[]): string {
  const parts: string[] = []
  let length = 2
  for (const slot of slots) {
    const part = JSON.stringify(slot)
    const next = length + part.length + (parts.length > 0 ? 1 : 0)
    if (next > MAX_SLOTS_JSON) break
    parts.push(part)
    length = next
  }
  return `[${parts.join(',')}]`
}
