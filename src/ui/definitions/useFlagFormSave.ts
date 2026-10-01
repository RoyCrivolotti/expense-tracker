import type { Flag } from '../../types'
import type { ExpenseActions } from '../actions'
import { useEntityFormSave } from './useEntityFormSave'

export interface FlagDraft {
  name: string
  description: string
  color: string
  reimbursable: boolean
  active: boolean
}

/** Pure: the form's opening values for an existing flag, or for a new one. */
export function initialFlagDraft(flag: Flag | null, defaultColor: string): FlagDraft {
  return {
    name: flag?.name ?? '',
    description: flag?.description ?? '',
    color: flag?.color ?? defaultColor,
    // New flags default to reimbursable: chasing money back is the case flags
    // were built for, and it is the one with something to do about it.
    reimbursable: flag?.reimbursable ?? true,
    active: flag?.active ?? true,
  }
}

/**
 * Save/delete plumbing for the flag editor, kept out of the component so the
 * form itself stays a layout concern (and under the complexity budget).
 * Mirrors useLabelFormSave exactly; both are thin wrappers around the shared
 * useEntityFormSave, parameterized by which actions to call and the "N
 * transactions affected" wording.
 */
export function useFlagFormSave(
  flag: Flag | null,
  existing: Flag[],
  actions: ExpenseActions,
  onDone: () => void,
) {
  return useEntityFormSave<Flag, FlagDraft>({
    entity: flag,
    existing,
    onDone,
    create: (draft) => actions.createFlag(draft),
    update: (id, draft) => actions.updateFlag(id, draft),
    remove: async (id) => {
      const { unflagged } = await actions.deleteFlag(id)
      return { affected: unflagged }
    },
    affectedNoun: 'unflagged',
  })
}
