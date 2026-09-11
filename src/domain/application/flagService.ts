import type { NewFlag } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'

/** Longer than this and the description stops being a hint and starts being a note. */
const MAX_DESCRIPTION_LENGTH = 140
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function validateFlagName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new Error('Flag name is required')
  return trimmed
}

export function validateFlagColor(color: string | undefined): string {
  const trimmed = color?.trim().toLowerCase()
  if (!trimmed || !HEX_COLOR.test(trimmed)) {
    throw new Error('Flag colour must be a hex value like #6366f1')
  }
  return trimmed
}

/**
 * Returns the trimmed description, or `undefined` when it is blank — an empty
 * string and "no description" mean the same thing to a reader, and collapsing
 * them here keeps the column NULL instead of storing ''.
 */
export function validateFlagDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Flag description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`)
  }
  return trimmed
}

function normalizeNewFlag(input: NewFlag): NewFlag {
  // `description` is pulled out of the spread on purpose: spreading `input`
  // first would carry the raw, untrimmed value through whenever the normalised
  // one is dropped for being blank.
  const { description: raw, ...rest } = input
  const description = validateFlagDescription(raw)
  return {
    ...rest,
    name: validateFlagName(input.name),
    color: validateFlagColor(input.color),
    ...(description ? { description } : {}),
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
  if (patch.description !== undefined) {
    // Explicit '' is how the editor clears a description, so map it to '' (not
    // undefined) — dropping the key would leave the old text in place.
    next.description = validateFlagDescription(patch.description) ?? ''
  }
  return repo.updateFlag(owner, id, next)
}

export async function removeFlag(repo: ExpenseRepository, owner: string, id: number) {
  return repo.deleteFlag(owner, id)
}
