import { useCallback, useState, type RefObject } from 'react'
import { UNDO_SHORTCUT } from '../components/toastShortcuts'
import { useToast } from '../hooks/useToast'
import { OWNER_KEYS, ownerKey, useAccountOwner } from '../hooks/accountOwner'
import { useStoppedSuggestions } from './stoppedSuggestions'
import type { MarkedSuggestion } from './useRecurringMarks'

function loadDismissed(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function persistDismissed(
  key: string,
  set: Set<string>,
): void {
  localStorage.setItem(key, JSON.stringify([...set]))
}

export function dismissKey(s: MarkedSuggestion): string {
  return `${s.description}|${s.accountId}|${s.categoryId}|${s.type}|${s.predictedBudgetMonth}`
}

/** The key as it was before it carried the category and type, so a dismissal saved then still applies. */
function legacyDismissKey(s: MarkedSuggestion): string {
  return `${s.description}|${s.accountId}|${s.predictedBudgetMonth}`
}

/** The suggestions left once the dismissed ones are taken out, and the way to hide or bring one back. */
export function useDismissedSuggestions(suggestions: MarkedSuggestion[]) {
  // Kept for the signed-in person: the keys name what their ledger holds, and the device may be used by someone else.
  const storageKey = ownerKey(OWNER_KEYS.dismissed, useAccountOwner())
  const [dismissed, setDismissed] = useState(() => loadDismissed(storageKey))

  const visible = suggestions.filter((s) => !dismissed.has(dismissKey(s)) && !dismissed.has(legacyDismissKey(s)))

  const setHidden = useCallback(
    (s: MarkedSuggestion, hidden: boolean) => {
      setDismissed((prev) => {
        const next = new Set(prev)
        if (hidden) next.add(dismissKey(s))
        else next.delete(dismissKey(s))
        persistDismissed(storageKey, next)
        return next
      })
    },
    [storageKey],
  )

  return { visible, setHidden }
}

/** What the two buttons on a row do: hide the charge for now, or stop suggesting its series, each with an undo. */
export function useSuggestionActions(
  rows: RefObject<HTMLDivElement | null>,
  setHidden: (
    s: MarkedSuggestion,
    hidden: boolean,
  ) => void,
) {
  const { showToast } = useToast()
  const { stop, restore } = useStoppedSuggestions()

  // The row the focus was on is gone; the one that takes its place, or the one before it when it
  // was the last, gets the focus.
  const focusRowAt = (index: number) => {
    requestAnimationFrame(() => {
      // Rows folded out of sight are inert and cannot take it.
      const remaining = [...(rows.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].filter(
        (row) => !row.closest('[inert]'),
      )
      remaining[Math.min(index, remaining.length - 1)]?.querySelector('button')?.focus()
    })
  }

  const handleDismiss = (
    s: MarkedSuggestion,
    index: number,
  ) => {
    setHidden(s, true)
    showToast(`Dismissed ${s.description}`, 'info', {
      label: 'Undo',
      onAction: () => setHidden(s, false),
      shortcut: UNDO_SHORTCUT,
    })
    focusRowAt(index)
  }

  const handleStop = (
    s: MarkedSuggestion,
    index: number,
  ) => {
    stop(s.seriesKey, { after: s.lastChargeDate, label: s.description })
    showToast(`Stopped suggesting ${s.description}`, 'info', {
      label: 'Undo',
      onAction: () => restore(s.seriesKey),
      shortcut: UNDO_SHORTCUT,
    })
    focusRowAt(index)
  }

  return { handleDismiss, handleStop }
}
