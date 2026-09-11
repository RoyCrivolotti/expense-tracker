import { useEffect, type RefObject } from 'react'

export function useDismissOnOutsidePointer(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  excludeRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (excludeRef?.current?.contains(target)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, containerRef, onDismiss, excludeRef])
}
