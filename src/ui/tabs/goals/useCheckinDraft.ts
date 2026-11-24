import { useRef, useState } from 'react'
import type { WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { formatMoneyInput, tryParseMoneyToCents, type MoneyFormat } from '../../../engine'

export type EntryDraft = { accountId: number; valueCents: number }

interface CheckinDraftInput {
  active: WealthAccount[]
  previous: WealthCheckin | null
  actions: ExpenseActions
  format: MoneyFormat
  date: string
  note: string
  onDone: (() => void) | undefined
}

/**
 * The balances a new check-in holds, starting from the previous one's, and saving them: only the ones that are
 * balances (typed, carried over, or not zero), and never a check-in where every balance is zero.
 */
export function useCheckinDraft(input: CheckinDraftInput) {
  const { active, previous, actions, format, date, note, onDone } = input
  const [entries, setEntries] = useState<EntryDraft[]>(() =>
    active.map((a) => ({
      accountId: a.id,
      valueCents: previous?.entries.find((e) => e.accountId === a.id)?.valueCents ?? 0,
    })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which fields the user has been in. A zero the user typed, or one carried over from
  // the previous check-in, is a balance; a zero left on an account they never touched
  // is not. The form only creates, so a field never starts from this check-in's own row.
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set())

  const setEntry = (
    accountId: number,
    valueCents: number,
  ) => {
    setEntries((prev) => prev.map((e) => (e.accountId === accountId ? { ...e, valueCents } : e)))
    setTouched((prev) => (prev.has(accountId) ? prev : new Set(prev).add(accountId)))
  }
  // What each box held when it was entered. Typing "1e9" passes through "1", which is an amount, so the last amount
  // seen while typing is a keystroke's, not the one the person had; text that ends up not an amount goes back to this.
  const heldOnEntry = useRef(new Map<number, number>())
  // An empty box is a balance of nothing, which a check-in may say. Text that is not an amount is none at all.
  const readBalance = (raw: string): number | null => (raw.trim() === '' ? 0 : tryParseMoneyToCents(raw, format))
  // Leaving the box (or Enter): the amount it holds, written back as the form will use it. Text that is not an
  // amount puts back what the box held when it was entered, and a zero is an empty box with the zero as its placeholder.
  const commitBalance = (
    input: HTMLInputElement,
    entry: EntryDraft,
  ) => {
    const cents = readBalance(input.value) ?? heldOnEntry.current.get(entry.accountId) ?? entry.valueCents
    setEntry(entry.accountId, cents)
    input.value = cents === 0 ? '' : formatMoneyInput(cents, format)
  }
  const recorded = (e: EntryDraft) =>
    e.valueCents !== 0 ||
    touched.has(e.accountId) ||
    previous?.entries.some((p) => p.accountId === e.accountId) === true

  // A check-in with every balance at zero says nothing, yet it would silence the
  // dashboard's nudge for a month and read as being behind by the whole plan.
  const empty = entries.every((e) => e.valueCents === 0)

  const handleSubmit = async () => {
    if (!date || empty) return
    setSubmitting(true)
    setError(null)
    try {
      const trimmedNote = note.trim()
      await actions.createWealthCheckin({
        checkinDate: date,
        ...(trimmedNote ? { note: trimmedNote } : {}),
        entries: entries.filter(recorded),
      })
      onDone?.()
    } catch (e) {
      // Without this the save fails in silence: the button simply re-enables and
      // nothing on screen says why. The server refuses a future-dated check-in, and
      // a clock a day ahead of the server's slack is enough to reach that.
      setError(e instanceof Error ? e.message : 'Could not save the check-in')
    } finally {
      setSubmitting(false)
    }
  }
  // The box is entered: what it holds then is what text that is not an amount goes back to.
  const holdOnEntry = (entry: EntryDraft) => heldOnEntry.current.set(entry.accountId, entry.valueCents)
  return { entries, submitting, error, empty, handleSubmit, readBalance, setEntry, commitBalance, holdOnEntry }
}
