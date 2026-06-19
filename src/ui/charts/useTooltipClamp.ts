import { useLayoutEffect, useRef, useState } from 'react'

const VIEWPORT_PAD = 10

function viewportBounds() {
  const vv = window.visualViewport
  const left = vv?.offsetLeft ?? 0
  const width = vv?.width ?? document.documentElement.clientWidth
  return { minLeft: left + VIEWPORT_PAD, maxRight: left + width - VIEWPORT_PAD }
}

function overflowShift(el: HTMLElement): number {
  const box = el.getBoundingClientRect()
  const { minLeft, maxRight } = viewportBounds()
  if (box.left < minLeft) return minLeft - box.left
  if (box.right > maxRight) return maxRight - box.right
  return 0
}

/** Keep tooltip inside the visible viewport (handles mobile safe areas / visualViewport). */
export function useTooltipClamp(leftPct: number, contentKey: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [shiftX, setShiftX] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      setShiftX(0)
      return
    }

    const measure = (shift: number) => {
      el.style.transform = `translateX(calc(-50% + ${shift}px))`
      return overflowShift(el)
    }

    let shift = measure(0)
    if (shift !== 0) {
      shift += measure(shift)
    }
    el.style.transform = ''
    setShiftX(shift)

    const vv = window.visualViewport
    const onViewportChange = () => {
      const node = ref.current
      if (!node) return
      const apply = (shift: number) => {
        node.style.transform = `translateX(calc(-50% + ${shift}px))`
        return overflowShift(node)
      }
      let next = apply(0)
      if (next !== 0) next += apply(next)
      node.style.transform = ''
      setShiftX(next)
    }
    vv?.addEventListener('resize', onViewportChange)
    vv?.addEventListener('scroll', onViewportChange)
    window.addEventListener('resize', onViewportChange)
    return () => {
      vv?.removeEventListener('resize', onViewportChange)
      vv?.removeEventListener('scroll', onViewportChange)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [leftPct, contentKey])

  return { ref, shiftX }
}
