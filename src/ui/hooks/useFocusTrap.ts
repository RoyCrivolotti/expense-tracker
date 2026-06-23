import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/** Modal focus trap: initial focus, restore on unmount, Escape, Tab cycle. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onEscape: () => void): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const container = ref.current
    const focusables = container ? focusableWithin(container) : []
    ;(focusables[0] ?? container)?.focus()
    return () => previouslyFocused?.focus?.()
  }, [ref])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
  }, [ref, onEscape])
}
