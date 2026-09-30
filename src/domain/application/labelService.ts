import type { NewLabel } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { ValidationError } from './validationError'

/** Longer than this and the description stops being a hint and starts being a note. */
const MAX_DESCRIPTION_LENGTH = 140
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function validateLabelName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new ValidationError('Label name is required')
  return trimmed
}

export function validateLabelColor(color: string | undefined): string {
  const trimmed = color?.trim().toLowerCase()
  if (!trimmed || !HEX_COLOR.test(trimmed)) {
    throw new ValidationError('Label colour must be a hex value like #6366f1')
  }
  return trimmed
}

export function validateLabelSortOrder(sortOrder: unknown): number {
  // Same reasoning as validateFlagSortOrder: a non-numeric value is stored as
  // TEXT in an INTEGER column and silently breaks every sort that reads it back.
  if (!Number.isInteger(sortOrder)) throw new ValidationError('Label sort order must be a whole number')
  return sortOrder as number
}

export function validateLabelActive(active: unknown): boolean {
  if (typeof active !== 'boolean') throw new ValidationError('Label active must be true or false')
  return active
}

/**
 * Returns the trimmed description, or `undefined` when it is blank — an empty
 * string and "no description" mean the same thing to a reader, and collapsing
 * them here keeps the column NULL instead of storing ''.
 */
export function validateLabelDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Label description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`)
  }
  return trimmed
}

function normalizeNewLabel(input: NewLabel): NewLabel {
  // `description` is pulled out of the spread on purpose: spreading `input`
  // first would carry the raw, untrimmed value through whenever the normalised
  // one is dropped for being blank.
  const { description: raw, ...rest } = input
  const description = validateLabelDescription(raw)
  return {
    ...rest,
    name: validateLabelName(input.name),
    color: validateLabelColor(input.color),
    sortOrder: validateLabelSortOrder(input.sortOrder),
    active: validateLabelActive(input.active),
    ...(description ? { description } : {}),
  }
}

export async function createLabel(repo: ExpenseRepository, owner: string, input: NewLabel) {
  return repo.createLabel(owner, normalizeNewLabel(input))
}

export async function patchLabel(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewLabel>,
) {
  const next = { ...patch }
  if (patch.name !== undefined) next.name = validateLabelName(patch.name)
  if (patch.color !== undefined) next.color = validateLabelColor(patch.color)
  if (patch.sortOrder !== undefined) next.sortOrder = validateLabelSortOrder(patch.sortOrder)
  if (patch.active !== undefined) next.active = validateLabelActive(patch.active)
  if (patch.description !== undefined) {
    // Explicit '' is how the editor clears a description, so map it to '' (not
    // undefined) — dropping the key would leave the old text in place.
    next.description = validateLabelDescription(patch.description) ?? ''
  }
  return repo.updateLabel(owner, id, next)
}

export async function removeLabel(repo: ExpenseRepository, owner: string, id: number) {
  return repo.deleteLabel(owner, id)
}

function validateLabelIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) throw new ValidationError('labelIds must be an array')
  const ids = raw.map((v) => {
    if (!Number.isInteger(v) || (v as number) <= 0) throw new ValidationError('Invalid labelId')
    return v as number
  })
  // A transaction cannot carry the same label twice — transaction_labels has a
  // UNIQUE(transaction_id, label_id) constraint, so a duplicate here would
  // otherwise surface as a raw constraint-violation error instead of a no-op.
  return [...new Set(ids)]
}

export async function setTransactionLabels(
  repo: ExpenseRepository,
  owner: string,
  transactionId: number,
  rawLabelIds: unknown,
) {
  return repo.setTransactionLabels(owner, transactionId, validateLabelIds(rawLabelIds))
}
