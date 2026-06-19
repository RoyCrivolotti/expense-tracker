import { useLayoutEffect, useState, type RefObject } from 'react'
import { svgViewBoxToScreen } from './chartAnchor'

interface ViewPoint {
  x: number
  y: number
}

/** Screen-space anchor for a viewBox point; updates on scroll/resize. */
export function useSvgAnchor(
  svgRef: RefObject<SVGSVGElement | null>,
  x: number | null,
  y: number | null,
) {
  const [anchor, setAnchor] = useState<ViewPoint | null>(null)

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg || x == null || y == null) {
      setAnchor(null)
      return
    }

    const update = () => setAnchor(svgViewBoxToScreen(svg, x, y))
    update()

    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [svgRef, x, y])

  return anchor
}
