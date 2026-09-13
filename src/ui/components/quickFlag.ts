import type { NewFlag } from '../../data/dataSource'
import type { Flag } from '../../types'
import type { ExpenseActions } from '../actions'
import { pickScenarioColor } from '../../domain/engine/projectionPresets'

/**
 * A flag created without leaving the transaction you are editing.
 *
 * Only a name is asked for. Everything else takes the same defaults the full
 * editor opens on, so the two cannot drift:
 *
 * - **reimbursable** is asked for, not assumed. It decides whether the flag
 *   offers an expense report and a Record reimbursement action at all, so
 *   guessing it wrong means either a missing feature or a document addressed to
 *   nobody. It defaults to ticked, matching `initialFlagDraft` and migration
 *   0019's column default.
 * - **colour** picked distinct from the ones already in use, reusing the goal
 *   scenarios' palette walker rather than defaulting every quick flag to the
 *   first swatch and making them indistinguishable at a glance.
 * - **sortOrder** at the end, matching `useFlagFormSave`, so a flag appears
 *   where it was added rather than jumping the list.
 *
 * Description is deliberately left empty: it prints under the name on an expense
 * report, and a guess there ends up on a document handed to an employer.
 *
 * Returns null for a blank name so the caller can stay quiet rather than raising
 * an error for an empty box somebody opened and thought better of.
 */
export function quickFlagDraft(
  name: string,
  existing: Flag[],
  reimbursable = true,
): NewFlag | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return {
    name: trimmed,
    color: pickScenarioColor(existing.map((f) => f.color)),
    reimbursable,
    active: true,
    sortOrder: Math.max(-1, ...existing.map((f) => f.sortOrder)) + 1,
  }
}

/** Case- and whitespace-insensitive, because "Work travel" twice helps nobody. */
export function duplicateFlagName(name: string, existing: Flag[]): boolean {
  const trimmed = name.trim().toLocaleLowerCase()
  return existing.some((f) => f.name.trim().toLocaleLowerCase() === trimmed)
}

/**
 * The `onCreate` a picker wants: name in, new flag id out.
 *
 * Shared by both callers so neither has to unwrap `quickFlagDraft`'s null with a
 * non-null assertion. The blank case cannot normally arrive — QuickCreate checks
 * first — but throwing puts the message on the picker's own error line rather
 * than leaving a rejected promise nobody renders.
 */
export function createFlagInPlace(
  actions: ExpenseActions,
  flags: Flag[],
): (name: string, reimbursable: boolean) => Promise<number> {
  return async (name, reimbursable) => {
    const draft = quickFlagDraft(name, flags, reimbursable)
    if (!draft) throw new Error('Enter a name')
    const created = await actions.createFlag(draft)
    return created.id
  }
}
