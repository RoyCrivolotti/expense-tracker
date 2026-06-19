import { useLayoutEffect, useRef, useState } from 'react'
import { clampTooltipLeft, clampTooltipTop, viewportBounds } from './tooltipPosition'

interface Position {
  left: number
  top: number
}

/** Fixed pixel position for a portaled tooltip, clamped to the viewport. */
export function useTooltipPosition(
  anchorX: number | null,
  anchorY: number | null,
  contentKey: string,
) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Position | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || anchorX == null || anchorY == null) {
      setPos(null)
      return
    }

    const update = () => {
      const node = ref.current
      if (!node || anchorX == null || anchorY == null) return
      const bounds = viewportBounds()
      const { width, height } = node.getBoundingClientRect()
      setPos({
        left: clampTooltipLeft(anchorX, width, bounds),
        top: clampTooltipTop(anchorY, height, bounds),
      })
    }

    update()
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [anchorX, anchorY, contentKey])

  return { ref, pos }
}
