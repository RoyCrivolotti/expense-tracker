import type { TooltipLine } from './ChartTooltip'

/** A tooltip shows only in 'full' mode: 'hidden' tracks focus for a caller's own readout instead. */
export function tooltipShows(
  tip: { title: string; lines: TooltipLine[] } | null,
  tooltipMode: 'full' | 'hidden',
): boolean {
  return tip != null && tooltipMode === 'full'
}

/**
 * Arrow keys step a marker, so a chart is only worth a Tab stop when something shows where it
 * is: a tooltip, or a caller reading the focus through onActiveIndexChange (the hero chart's
 * legend). Without either it stays focusable by click but is not a silent stop in the Tab order.
 */
export function tabIndexFor(
  tooltipMode: 'full' | 'hidden',
  onActiveIndexChange: ((index: number | null) => void) | undefined,
): 0 | -1 {
  return tooltipMode === 'full' || onActiveIndexChange !== undefined ? 0 : -1
}

/** What names the text that says how to use a chart from the keyboard, for the chart that can be. */
export function describedBy(
  steppable: boolean,
  id: string,
): { 'aria-describedby'?: string } {
  return steppable ? { 'aria-describedby': id } : {}
}
