import type { NewFlag } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { ValidationError } from './validationError'
import {
  validateEntityActive,
  validateEntityColor,
  validateEntityDescription,
  validateEntitySortOrder,
} from './entityValidation'

export function validateFlagName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new ValidationError('Flag name is required')
  return trimmed
}

export function validateFlagColor(color: string | undefined): string {
  return validateEntityColor('Flag', color)
}

export function validateFlagSortOrder(sortOrder: unknown): number {
  return validateEntitySortOrder('Flag', sortOrder)
}

export function validateFlagActive(active: unknown): boolean {
  return validateEntityActive('Flag', active)
}

/**
 * Returns the trimmed description, or `undefined` when it is blank — an empty
 * string and "no description" mean the same thing to a reader, and collapsing
 * them here keeps the column NULL instead of storing ''.
 */
export function validateFlagDescription(description: string | undefined): string | undefined {
  return validateEntityDescription('Flag', description)
}

/** `undefined` leaves it alone, `null` clears it — same contract as the patch itself. */
export function validateFlagAutoLabelId(autoLabelId: unknown): number | null | undefined {
  if (autoLabelId === undefined || autoLabelId === null) return autoLabelId
  if (!Number.isInteger(autoLabelId) || (autoLabelId as number) <= 0) {
    throw new ValidationError('Flag auto-label id must be a positive whole number')
  }
  return autoLabelId as number
}

function normalizeNewFlag(input: NewFlag): NewFlag {
  // `description` is pulled out of the spread on purpose: spreading `input`
  // first would carry the raw, untrimmed value through whenever the normalised
  // one is dropped for being blank.
  const { description: raw, autoLabelId: rawAutoLabelId, ...rest } = input
  const description = validateFlagDescription(raw)
  const autoLabelId = validateFlagAutoLabelId(rawAutoLabelId)
  return {
    ...rest,
    name: validateFlagName(input.name),
    color: validateFlagColor(input.color),
    sortOrder: validateFlagSortOrder(input.sortOrder),
    active: validateFlagActive(input.active),
    ...(description ? { description } : {}),
    ...(autoLabelId != null ? { autoLabelId } : {}),
  }
}

export async function createFlag(repo: ExpenseRepository, owner: string, input: NewFlag) {
  return repo.createFlag(owner, normalizeNewFlag(input))
}

export async function patchFlag(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewFlag>,
) {
  const next = { ...patch }
  if (patch.name !== undefined) next.name = validateFlagName(patch.name)
  if (patch.color !== undefined) next.color = validateFlagColor(patch.color)
  if (patch.sortOrder !== undefined) next.sortOrder = validateFlagSortOrder(patch.sortOrder)
  if (patch.active !== undefined) next.active = validateFlagActive(patch.active)
  if (patch.description !== undefined) {
    // Explicit '' is how the editor clears a description, so map it to '' (not
    // undefined) — dropping the key would leave the old text in place.
    next.description = validateFlagDescription(patch.description) ?? ''
  }
  if (patch.autoLabelId !== undefined) {
    // The guard above already excludes the `undefined` the validator can return
    // for an absent input; this call can never see that branch.
    next.autoLabelId = validateFlagAutoLabelId(patch.autoLabelId) as number | null
  }
  return repo.updateFlag(owner, id, next)
}

export async function removeFlag(repo: ExpenseRepository, owner: string, id: number) {
  return repo.deleteFlag(owner, id)
}
