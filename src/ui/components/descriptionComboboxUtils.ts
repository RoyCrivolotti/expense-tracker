import type { KeyboardEvent, RefObject } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'

export function moveHighlight(current: number, delta: number, max: number): number {
  if (max <= 0) return -1
  if (current < 0) return 0
  return (current + delta + max) % max
}

interface KeyHandlerOpts {
  open: boolean
  suggestions: DescriptionSuggestion[]
  highlight: number
  setHighlight: (value: number | ((h: number) => number)) => void
  setFocused: (value: boolean) => void
  accept: (suggestion: DescriptionSuggestion) => void
  /**
   * Optional "Enter means submit" hook for callers that treat the combobox as
   * the last field of a quick-entry row. Deliberately NOT fired when a
   * suggestion is highlighted: accepting one rewrites type, category and
   * account, and committing in the same keystroke would hide that from the
   * user. Omitting it leaves Enter behaving exactly as it always has.
   */
  onEnter?: (() => void) | undefined
}

export function handleComboboxKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  opts: KeyHandlerOpts,
): void {
  const { open, suggestions, highlight, setHighlight, setFocused, accept, onEnter } = opts
  // Enter is resolved before the closed-list early return below, because a
  // caller with onEnter needs it to fire whether or not the list is showing.
  if (e.key === 'Enter') {
    if (open && highlight >= 0) {
      e.preventDefault()
      const picked = suggestions[highlight]
      if (picked) accept(picked)
      return
    }
    if (onEnter) {
      e.preventDefault()
      setFocused(false)
      onEnter()
    }
    return
  }
  if (!open) {
    if (e.key === 'Escape') setFocused(false)
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setHighlight((h) => moveHighlight(h, 1, suggestions.length))
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    setHighlight((h) => moveHighlight(h, -1, suggestions.length))
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    setFocused(false)
    setHighlight(-1)
  }
}

export function scheduleBlurDismiss(
  rootRef: RefObject<HTMLDivElement | null>,
  dismiss: () => void,
): void {
  window.setTimeout(() => {
    if (!rootRef.current?.contains(document.activeElement)) dismiss()
  }, 120)
}
