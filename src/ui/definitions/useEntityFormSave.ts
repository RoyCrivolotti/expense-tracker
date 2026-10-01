import { useState } from 'react'
import { useToast } from '../hooks/useToast'
import { transactionCountLabel } from '../components/flagPickerOptions'

interface SortableEntity {
  id: number
  name: string
  sortOrder: number
}

interface UseEntityFormSaveOptions<TEntity extends SortableEntity, TDraft extends { name: string }> {
  entity: TEntity | null
  existing: TEntity[]
  onDone: () => void
  create: (draft: TDraft & { sortOrder: number; active: true }) => Promise<unknown>
  update: (id: number, draft: TDraft) => Promise<unknown>
  /** Resolves to how many transactions were affected, for the delete toast. */
  remove: (id: number) => Promise<{ affected: number }>
  /** e.g. "unflagged" / "unlabeled" — the word that goes with the affected count. */
  affectedNoun: string
}

/**
 * Save/delete plumbing shared by the flag and label editors, kept out of the
 * form components so each one stays a layout concern (and under the
 * complexity budget). Flags and labels differ only in which actions they
 * call and the toast copy, both supplied by the caller.
 */
export function useEntityFormSave<TEntity extends SortableEntity, TDraft extends { name: string }>({
  entity,
  existing,
  onDone,
  create,
  update,
  remove,
  affectedNoun,
}: UseEntityFormSaveOptions<TEntity, TDraft>) {
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

  const save = (draft: TDraft) => {
    if (busy) return
    if (!draft.name.trim()) {
      setErr('Enter a name')
      return
    }
    void run(() =>
      entity
        ? update(entity.id, draft)
        : // New entries go to the end of the list, matching how the pickers order them.
          create({
            ...draft,
            sortOrder: Math.max(-1, ...existing.map((e) => e.sortOrder)) + 1,
            active: true,
          }),
    )
  }

  const removeEntity = () => {
    if (!entity) return
    void run(async () => {
      const { affected } = await remove(entity.id)
      // Deleting silently changes rows the user is not looking at; say how
      // many, which is exactly what the delete action returns the count for.
      showToast(
        affected === 0
          ? `Deleted ${entity.name}`
          : `Deleted ${entity.name} — ${affectedNoun} ${transactionCountLabel(affected)}`,
        'success',
      )
    })
  }

  return { busy, err, save, remove: removeEntity }
}
