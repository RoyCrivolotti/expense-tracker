import { useLayoutEffect, useRef, useState } from 'react'

/** Nudge tooltip horizontally so it stays inside its offsetParent. */
export function useTooltipClamp(leftPct: number, contentKey: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [shiftX, setShiftX] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent
    if (!el || !(parent instanceof HTMLElement)) {
      setShiftX(0)
      return
    }
    const pad = 6
    const bounds = parent.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    let shift = 0
    if (box.left < bounds.left + pad) shift = bounds.left + pad - box.left
    else if (box.right > bounds.right - pad) shift = bounds.right - pad - box.right
    setShiftX(shift)
  }, [leftPct, contentKey])

  return { ref, shiftX }
}
