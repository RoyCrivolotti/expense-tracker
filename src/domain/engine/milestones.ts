/**
 * Net-worth milestone list handling, shared by the API, the in-memory test repo
 * and the UI so all three agree on what a storable milestone list looks like.
 */
import type { Milestone } from '../types'
import {
  DEFAULT_MILESTONE_CENTS,
  MILESTONE_LABEL_MAX_LENGTH,
  MILESTONE_MAX_CENTS,
  MILESTONE_MAX_COUNT,
} from './projectionConstants'

/** The built-in ladder used when an owner has never customised their list. */
export function defaultMilestones(): Milestone[] {
  return DEFAULT_MILESTONE_CENTS.map((amountCents) => ({ amountCents, label: '' }))
}

/**
 * Sort ascending, drop duplicate amounts (first label wins) and trim labels to
 * the storable length. Call `validateMilestones` first: this assumes shape is
 * already correct and only tidies the contents.
 */
export function normalizeMilestones(input: Milestone[]): Milestone[] {
  const seen = new Set<number>()
  return [...input]
    .sort((a, b) => a.amountCents - b.amountCents)
    .filter((m) => {
      if (seen.has(m.amountCents)) return false
      seen.add(m.amountCents)
      return true
    })
    .map((m) => ({
      amountCents: m.amountCents,
      label: (m.label ?? '').trim().slice(0, MILESTONE_LABEL_MAX_LENGTH),
    }))
}

/** A milestone's trimmed name, or null when it is unnamed. */
export function milestoneName(m: Milestone): string | null {
  return m.label.trim() || null
}

/**
 * "House deposit (100k €)" when named, else just "100k €". For prose and single
 * lines; the matrix headers stack the two parts instead. Takes the formatter so
 * callers can pick full or abbreviated money rendering.
 */
export function milestoneLabelWithAmount(
  m: Milestone,
  formatAmount: (cents: number) => string,
): string {
  const amount = formatAmount(m.amountCents)
  const name = milestoneName(m)
  return name ? `${name} (${amount})` : amount
}

/** Error message when the value cannot be stored as a milestone list, else null. */
export function validateMilestones(value: unknown): string | null {
  if (!Array.isArray(value)) return 'milestones must be an array'
  if (value.length > MILESTONE_MAX_COUNT) {
    return `milestones must have at most ${MILESTONE_MAX_COUNT} entries`
  }
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return 'each milestone must be an object'
    }
    const { amountCents, label } = entry as Partial<Milestone>
    if (
      typeof amountCents !== 'number' ||
      !Number.isInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > MILESTONE_MAX_CENTS
    ) {
      return `milestone amountCents must be an integer between 1 and ${MILESTONE_MAX_CENTS}`
    }
    if (label !== undefined && typeof label !== 'string') {
      return 'milestone label must be a string'
    }
  }
  return null
}

/**
 * Resolve the stored column into a usable list.
 *
 * `null` means the owner never customised theirs, so the defaults apply. A
 * stored empty array is a deliberate "no milestones" choice and is preserved.
 * Malformed JSON also falls back to the defaults rather than an empty list, so
 * a corrupted row degrades to the familiar ladder instead of a blank matrix.
 */
export function parseMilestones(raw: string | null): Milestone[] {
  if (raw === null) return defaultMilestones()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (validateMilestones(parsed) !== null) return defaultMilestones()
    return normalizeMilestones(parsed as Milestone[])
  } catch {
    return defaultMilestones()
  }
}
