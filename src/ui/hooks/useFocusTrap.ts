import { useEffect, useState, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableWithin(root: HTMLElement): HTMLElement[] {
  // querySelectorAll matches elements inside a `[hidden]` subtree too (the attribute
  // only affects rendering, not the DOM tree) — exclude those, or a trap containing a
  // mounted-but-hidden sibling (e.g. a form kept alive to preserve its state while
  // another is shown) sends initial focus, and Tab-cycles, into unreachable fields.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.closest('[hidden]') === null,
  )
}

/**
 * Modal focus trap: initial focus, restore on unmount, Escape, Tab cycle.
 *
 * `paused` stands this trap down (no Tab cycling, no Escape) without unmounting it —
 * for when a nested dialog (e.g. a `ConfirmSheet`) renders inside this container and
 * owns its own trap. Without this, both traps' document-level keydown listeners fire
 * on every Tab press; this trap's "whole container" focusable list includes the nested
 * dialog's buttons too, so Tab can wrap focus out to controls behind the nested dialog.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
  paused = false,
): void {
  // Captured during render, before this trap's own DOM commits. An effect would run
  // after the browser has already applied any `autoFocus` inside the trap (the amount
  // field on every transaction form), capturing that instead of the real trigger. The
  // lazy initializer runs exactly once, at mount, before anything here can steal focus.
  const [previouslyFocused] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    const container = ref.current
    const focusables = container ? focusableWithin(container) : []
    ;(focusables[0] ?? container)?.focus()
    return () => {
      // A sheet stays mounted for a moment after it closes, so focus may have moved on in
      // that time (a confirm handing over to a sheet with a field in it). Take it back
      // only if nothing else has claimed it, or the newcomer loses its keyboard.
      const active = document.activeElement
      if (active && active !== document.body && !container?.contains(active)) return
      previouslyFocused?.focus?.()
    }
  }, [ref, previouslyFocused])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paused) return
      if (event.key === 'Escape') {
        onEscape()
        return
      }
      if (event.key !== 'Tab') return
      const container = ref.current
      if (!container) return
      const focusables = focusableWithin(container)
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) {
        event.preventDefault()
        container.focus()
        return
      }
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ref, onEscape, paused])
}
