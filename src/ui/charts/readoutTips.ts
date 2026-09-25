import type { TooltipLine } from './ChartTooltip'

export interface ReadoutTip {
  title: string
  lines: TooltipLine[]
}

/** The hint on the readout before any point is tapped, and when the tapped one has more to read under the chart. */
export const RESTING_NOTE = 'Tap the chart to see another point'
export const DETAIL_NOTE = 'Breakdown under the chart'

export const isDetail = (line: TooltipLine) => line.variant === 'detail'

/** The lines the readout above the chart holds; the detail lines go under the chart instead. */
export function summaryOf(tip: ReadoutTip): ReadoutTip {
  return { title: tip.title, lines: tip.lines.filter((line) => !isDetail(line)) }
}

/**
 * The tip with the most summary lines. The readout is sized to it, so the chart under the
 * readout stays where it is however many lines the point being read has.
 */
export function tallestTip(tips: ReadoutTip[]): ReadoutTip | null {
  let best: ReadoutTip | null = null
  for (const tip of tips) {
    if (best === null || tip.lines.length > best.lines.length) best = tip
  }
  return best
}
