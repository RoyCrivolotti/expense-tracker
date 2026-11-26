import type { KeyboardEvent, MouseEvent } from 'react'
import { nearestIndex } from '../../charts/useChartFocus'
import type { TrendPoint } from './trendChartModel'

/** The click and Enter handlers of the trend chart. */
export function trendHandlers(
  points: TrendPoint[],
  active: number | null,
  xForIndex: (i: number) => number,
  onSelectMonth: (month: string) => void,
  focusKeyDown: (e: KeyboardEvent<SVGSVGElement>) => void,
) {
  // The focus hook captures the pointer on pointerdown, which retargets the click
  // to the svg itself: a per-bar hit rect would never see it. So the svg owns the
  // click and maps it back to the nearest month, the same way hover focus does.
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = 0
    const { x } = pt.matrixTransform(ctm.inverse())
    const i = nearestIndex(x, points.length, xForIndex)
    if (i !== null) onSelectMonth(points[i]!.month)
  }

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Enter' && active != null) {
      e.preventDefault()
      onSelectMonth(points[active]!.month)
      return
    }
    focusKeyDown(e)
  }

  return { onClick, onKeyDown }
}
