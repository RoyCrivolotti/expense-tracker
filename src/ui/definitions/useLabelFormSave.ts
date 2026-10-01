import type { Label } from '../../types'
import type { ExpenseActions } from '../actions'
import { useEntityFormSave } from './useEntityFormSave'

export interface LabelDraft {
  name: string
  description: string
  color: string
  active: boolean
}

/** Pure: the form's opening values for an existing label, or for a new one. */
export function initialLabelDraft(label: Label | null, defaultColor: string): LabelDraft {
  return {
    name: label?.name ?? '',
    description: label?.description ?? '',
    color: label?.color ?? defaultColor,
    active: label?.active ?? true,
  }
}

/**
 * Save/delete plumbing for the label editor — mirrors useFlagFormSave exactly,
 * minus the reimbursable field labels don't have. Both are thin wrappers
 * around the shared useEntityFormSave, parameterized by which actions to call
 * and the "N transactions affected" wording.
 */
export function useLabelFormSave(
  label: Label | null,
  existing: Label[],
  actions: ExpenseActions,
  onDone: () => void,
) {
  return useEntityFormSave<Label, LabelDraft>({
    entity: label,
    existing,
    onDone,
    create: (draft) => actions.createLabel(draft),
    update: (id, draft) => actions.updateLabel(id, draft),
    remove: async (id) => {
      const { unlabeled } = await actions.deleteLabel(id)
      return { affected: unlabeled }
    },
    affectedNoun: 'unlabeled',
  })
}
