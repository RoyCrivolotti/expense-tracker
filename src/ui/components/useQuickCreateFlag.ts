import { useState } from 'react'
import type { Flag } from '../../types'
import { duplicateFlagName, quickFlagDraft } from './quickFlag'

/** The name, the reimbursable tick and the create call of the inline flag form. */
export function useQuickCreateFlag(
  flags: Flag[],
  onCreate: (
    name: string,
    reimbursable: boolean,
  ) => Promise<number>,
  onCreated: (flagId: number) => void,
) {
  const [name, setName] = useState('')
  // Ticked by default, matching the full editor. Asked rather than assumed: it
  // decides whether the flag offers an expense report and a Record
  // reimbursement action at all.
  const [reimbursable, setReimbursable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    if (!quickFlagDraft(name, flags)) {
      setErr('Enter a name')
      return
    }
    if (duplicateFlagName(name, flags)) {
      setErr('There is already a flag with that name')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      onCreated(await onCreate(name, reimbursable))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the flag')
      setBusy(false)
    }
  }
  return { name, setName, reimbursable, setReimbursable, busy, err, setErr, submit }
}
