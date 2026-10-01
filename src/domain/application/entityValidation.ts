import { ValidationError } from './validationError'

/**
 * Shared validators for flags and labels — the two sibling entities that
 * ship the same colour/sort-order/active/description fields. Each function
 * takes the entity name ("Flag" / "Label") only to put it in the error
 * message; the rule itself is identical for both.
 */

/** Longer than this and the description stops being a hint and starts being a note. */
export const MAX_DESCRIPTION_LENGTH = 140
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function validateEntityColor(entity: string, color: string | undefined): string {
  const trimmed = color?.trim().toLowerCase()
  if (!trimmed || !HEX_COLOR.test(trimmed)) {
    throw new ValidationError(`${entity} colour must be a hex value like #6366f1`)
  }
  return trimmed
}

export function validateEntitySortOrder(entity: string, sortOrder: unknown): number {
  // SQLite has type affinity, not type enforcement: a non-numeric value is
  // stored as TEXT in an INTEGER column and silently breaks every sort that
  // reads it back. An explicit null fails the NOT NULL constraint and leaks the
  // raw D1 message through mapAppError. Reject both here instead.
  if (!Number.isInteger(sortOrder)) throw new ValidationError(`${entity} sort order must be a whole number`)
  return sortOrder as number
}

export function validateEntityActive(entity: string, active: unknown): boolean {
  if (typeof active !== 'boolean') throw new ValidationError(`${entity} active must be true or false`)
  return active
}

/**
 * Returns the trimmed description, or `undefined` when it is blank — an empty
 * string and "no description" mean the same thing to a reader, and collapsing
 * them here keeps the column NULL instead of storing ''.
 */
export function validateEntityDescription(entity: string, description: string | undefined): string | undefined {
  const trimmed = description?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`${entity} description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`)
  }
  return trimmed
}
