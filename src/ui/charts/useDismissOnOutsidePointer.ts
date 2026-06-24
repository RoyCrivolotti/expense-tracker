import { useEffect, type RefObject } from 'react'

/** Clear pinned chart focus when the user taps/clicks outside the chart container. */
export function useDismissOnOutsidePointer(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, containerRef, onDismiss])
}
