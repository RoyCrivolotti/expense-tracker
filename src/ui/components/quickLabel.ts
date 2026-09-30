import type { NewLabel } from '../../data/dataSource'
import type { Label } from '../../types'
import type { ExpenseActions } from '../actions'
import { pickScenarioColor } from '../../domain/engine/projectionPresets'

/**
 * A label created without leaving the transaction you are editing. Mirrors
 * quickFlagDraft, minus the reimbursable question a label never asks.
 */
export function quickLabelDraft(name: string, existing: Label[]): NewLabel | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return {
    name: trimmed,
    color: pickScenarioColor(existing.map((l) => l.color)),
    active: true,
    sortOrder: Math.max(-1, ...existing.map((l) => l.sortOrder)) + 1,
  }
}

/** Case- and whitespace-insensitive, because "Japan trip" twice helps nobody. */
export function duplicateLabelName(name: string, existing: Label[]): boolean {
  const trimmed = name.trim().toLocaleLowerCase()
  return existing.some((l) => l.name.trim().toLocaleLowerCase() === trimmed)
}

/**
 * The `onCreate` a picker wants: name in, new label id out. Mirrors
 * createFlagInPlace.
 */
export function createLabelInPlace(
  actions: ExpenseActions,
  labels: Label[],
): (name: string) => Promise<number> {
  return async (name) => {
    const draft = quickLabelDraft(name, labels)
    if (!draft) throw new Error('Enter a name')
    const created = await actions.createLabel(draft)
    return created.id
  }
}
