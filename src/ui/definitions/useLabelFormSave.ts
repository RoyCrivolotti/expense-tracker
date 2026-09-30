import { useState } from 'react'
import type { Label } from '../../types'
import type { ExpenseActions } from '../actions'
import { useToast } from '../hooks/useToast'
import { transactionCountLabel } from '../components/flagPickerOptions'

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
 * minus the reimbursable field labels don't have.
 */
export function useLabelFormSave(
  label: Label | null,
  existing: Label[],
  actions: ExpenseActions,
  onDone: () => void,
) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { showToast } = useToast()

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setErr(null)
    try {
      await work()
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const save = (draft: LabelDraft) => {
    if (busy) return
    if (!draft.name.trim()) {
      setErr('Enter a name')
      return
    }
    void run(() =>
      label
        ? actions.updateLabel(label.id, draft)
        : // New labels go to the end of the list, matching how the pickers order them.
          actions.createLabel({
            ...draft,
            sortOrder: Math.max(-1, ...existing.map((l) => l.sortOrder)) + 1,
            active: true,
          }),
    )
  }

  const remove = () => {
    if (!label) return
    void run(async () => {
      const { unlabeled } = await actions.deleteLabel(label.id)
      showToast(
        unlabeled === 0
          ? `Deleted ${label.name}`
          : `Deleted ${label.name} — unlabeled ${transactionCountLabel(unlabeled)}`,
        'success',
      )
    })
  }

  return { busy, err, save, remove }
}
