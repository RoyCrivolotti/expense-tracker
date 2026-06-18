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
}

export function handleComboboxKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  opts: KeyHandlerOpts,
): void {
  const { open, suggestions, highlight, setHighlight, setFocused, accept } = opts
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
  if (e.key === 'Enter' && highlight >= 0) {
    e.preventDefault()
    const picked = suggestions[highlight]
    if (picked) accept(picked)
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
