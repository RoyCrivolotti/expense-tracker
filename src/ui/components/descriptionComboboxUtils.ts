import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
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

/** Closes the list 120ms after focus leaves, unless focus has come back inside. Returns the timer so it can be cleared. */
export function scheduleBlurDismiss(
  rootRef: RefObject<HTMLDivElement | null>,
  dismiss: () => void,
): number {
  return window.setTimeout(() => {
    if (!rootRef.current?.contains(document.activeElement)) dismiss()
  }, 120)
}

/**
 * `scheduleBlurDismiss` for a component: the pending timer is cleared when the field goes away, so it cannot fire on
 * something that is no longer there (a form closed within 120ms of leaving the field).
 */
export function useBlurDismiss(rootRef: RefObject<HTMLDivElement | null>, dismiss: () => void): () => void {
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  return () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = scheduleBlurDismiss(rootRef, dismiss)
  }
}
