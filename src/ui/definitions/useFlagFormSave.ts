import { useState } from 'react'
import type { Flag } from '../../types'
import type { ExpenseActions } from '../actions'

export interface FlagDraft {
  name: string
  description: string
  color: string
  active: boolean
}

/** Pure: the form's opening values for an existing flag, or for a new one. */
export function initialFlagDraft(flag: Flag | null, defaultColor: string): FlagDraft {
  return {
    name: flag?.name ?? '',
    description: flag?.description ?? '',
    color: flag?.color ?? defaultColor,
    active: flag?.active ?? true,
  }
}

/**
 * Save/delete plumbing for the flag editor, kept out of the component so the
 * form itself stays a layout concern (and under the complexity budget).
 */
export function useFlagFormSave(
  flag: Flag | null,
  existing: Flag[],
  actions: ExpenseActions,
  onDone: () => void,
) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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

  const save = (draft: FlagDraft) => {
    if (busy) return
    if (!draft.name.trim()) {
      setErr('Enter a name')
      return
    }
    void run(() =>
      flag
        ? actions.updateFlag(flag.id, draft)
        : // New flags go to the end of the list, matching how the pickers order them.
          actions.createFlag({
            ...draft,
            sortOrder: Math.max(-1, ...existing.map((f) => f.sortOrder)) + 1,
            active: true,
          }),
    )
  }

  const remove = () => {
    if (!flag) return
    void run(() => actions.deleteFlag(flag.id))
  }

  return { busy, err, save, remove }
}
